//! epub(ZIP 안에 XHTML 챕터·이미지·`content.opf`가 든 전자책) 읽기. 미리보기용으로 메타데이터·표지·목차와 챕터 HTML을 돌려준다.
//! 안의 이미지는 데이터 주소로, 스타일시트는 `<style>`로 넣고 `<script>`는 지운다. HTML은 파서 없이 문자열로 다룬다.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use td_archive::{Archive, Kind};

const MAX_FILE: u64 = 100 * 1024 * 1024;
const MAX_CHAPTER: u64 = 2 * 1024 * 1024;
const MAX_CSS: u64 = 512 * 1024;
/// 글꼴 난독화는 DRM이 아니다. 이 방식 말고 다른 암호화가 있으면 읽지 않는다.
const FONT_OBFUSCATION: [&str; 2] = [
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
];

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EpubChapterDto {
    pub title: String,
}

/// epub 한 권의 겉모습. `cover`는 이미지 한도 안일 때만 들어 있다(데이터 주소).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct EpubInfoDto {
    pub title: Option<String>,
    pub author: Option<String>,
    pub cover: Option<String>,
    pub chapters: Vec<EpubChapterDto>,
}

struct Book {
    zip: Archive,
    title: Option<String>,
    author: Option<String>,
    cover: Option<String>,
    /// spine 순서의 챕터: (ZIP 안 경로, 제목)
    chapters: Vec<(String, String)>,
}

fn attr<'a>(n: roxmltree::Node<'a, 'a>, name: &str) -> Option<&'a str> {
    n.attributes().find(|a| a.name() == name).map(|a| a.value())
}

fn children<'a>(
    n: roxmltree::Node<'a, 'a>,
    name: &'a str,
) -> impl Iterator<Item = roxmltree::Node<'a, 'a>> {
    n.children()
        .filter(move |c| c.is_element() && c.tag_name().name() == name)
}

fn text_of(n: roxmltree::Node) -> String {
    n.descendants()
        .filter(|d| d.is_text())
        .filter_map(|d| d.text())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `base_dir`(ZIP 안 폴더, 끝 `/` 없음)을 기준으로 `href`를 ZIP 안 경로로 푼다. 바깥 주소·절대경로·`..`로 안을 벗어나는 경로는 None이다.
fn resolve(base_dir: &str, href: &str) -> Option<String> {
    let href = href.split(['#', '?']).next().unwrap_or("");
    if href.is_empty() || href.starts_with('/') || href.starts_with('\\') {
        return None;
    }
    if let Some(i) = href.find(':') {
        if !href[..i].contains('/') {
            return None; // `https:`, `data:`, `javascript:` 같은 스킴
        }
    }
    let decoded = percent_decode(href);
    let mut parts: Vec<&str> = base_dir.split('/').filter(|p| !p.is_empty()).collect();
    for seg in decoded.split(['/', '\\']) {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn dir_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(d, _)| d)
}

fn size_of(zip: &Archive, name: &str) -> Option<u64> {
    zip.entries()
        .iter()
        .find(|e| e.name == name)
        .map(|e| e.size)
}

fn read_text(zip: &Archive, name: &str) -> Result<String, String> {
    let bytes = zip.read(name).map_err(|e| format!("{name}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// 목차(EPUB3 nav 또는 EPUB2 ncx)에서 ZIP 안 경로 → 제목.
fn toc_titles(
    zip: &Archive,
    opf_dir: &str,
    manifest: &Manifest,
    toc_id: Option<&str>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    fn add(out: &mut HashMap<String, String>, dir: &str, href: &str, title: String) {
        if title.is_empty() {
            return;
        }
        if let Some(p) = resolve(dir, href) {
            out.entry(p).or_insert(title);
        }
    }
    let nav = manifest
        .values()
        .find(|m| m.properties.split_whitespace().any(|p| p == "nav"));
    if let Some(item) = nav {
        if let Some(path) = resolve(opf_dir, &item.href) {
            if let Ok(xml) = read_text(zip, &path) {
                if let Ok(doc) = roxmltree::Document::parse_with_options(
                    &xml,
                    roxmltree::ParsingOptions {
                        allow_dtd: true,
                        ..Default::default()
                    },
                ) {
                    let dir = dir_of(&path).to_string();
                    let toc = doc.descendants().find(|n| {
                        n.is_element()
                            && n.tag_name().name() == "nav"
                            && n.attributes().any(|a| {
                                a.name() == "type"
                                    && a.value().split_whitespace().any(|v| v == "toc")
                            })
                    });
                    if let Some(toc) = toc {
                        for a in toc
                            .descendants()
                            .filter(|n| n.is_element() && n.tag_name().name() == "a")
                        {
                            if let Some(h) = attr(a, "href") {
                                add(&mut out, &dir, h, text_of(a));
                            }
                        }
                    }
                }
            }
        }
    }
    if out.is_empty() {
        let ncx = toc_id.and_then(|id| manifest.get(id)).or_else(|| {
            manifest
                .values()
                .find(|m| m.media_type == "application/x-dtbncx+xml")
        });
        if let Some(item) = ncx {
            if let Some(path) = resolve(opf_dir, &item.href) {
                if let Ok(xml) = read_text(zip, &path) {
                    if let Ok(doc) = roxmltree::Document::parse_with_options(
                        &xml,
                        roxmltree::ParsingOptions {
                            allow_dtd: true,
                            ..Default::default()
                        },
                    ) {
                        let dir = dir_of(&path).to_string();
                        for p in doc
                            .descendants()
                            .filter(|n| n.is_element() && n.tag_name().name() == "navPoint")
                        {
                            let label = children(p, "navLabel")
                                .next()
                                .map(text_of)
                                .unwrap_or_default();
                            let src = children(p, "content").next().and_then(|c| attr(c, "src"));
                            if let Some(src) = src {
                                add(&mut out, &dir, src, label);
                            }
                        }
                    }
                }
            }
        }
    }
    out
}

struct Item {
    href: String,
    media_type: String,
    properties: String,
}
type Manifest = HashMap<String, Item>;

fn load(path: &Path) -> Result<Book, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if meta.len() > MAX_FILE {
        return Err("epub 파일이 너무 커서(100MB 초과) 미리 볼 수 없습니다".into());
    }
    let zip =
        Archive::open_as(path, Kind::Zip).map_err(|_| "epub(ZIP) 파일이 아닙니다".to_string())?;
    if size_of(&zip, "META-INF/encryption.xml").is_some() {
        let xml = read_text(&zip, "META-INF/encryption.xml")?;
        if let Ok(doc) = roxmltree::Document::parse(&xml) {
            let drm = doc
                .descendants()
                .filter(|n| n.is_element() && n.tag_name().name() == "EncryptionMethod")
                .any(|n| !attr(n, "Algorithm").is_some_and(|a| FONT_OBFUSCATION.contains(&a)));
            if drm {
                return Err("암호화(DRM)된 epub은 미리 볼 수 없습니다".into());
            }
        }
    }
    if size_of(&zip, "META-INF/container.xml").is_none() {
        return Err("epub의 container.xml이 없습니다".into());
    }
    let container = read_text(&zip, "META-INF/container.xml")?;
    let cdoc = roxmltree::Document::parse(&container)
        .map_err(|_| "epub의 container.xml을 읽지 못했습니다".to_string())?;
    let opf_path = cdoc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "rootfile")
        .and_then(|n| attr(n, "full-path"))
        .and_then(|p| resolve("", p))
        .ok_or_else(|| "epub의 패키지 문서(OPF)를 찾지 못했습니다".to_string())?;
    if size_of(&zip, &opf_path).is_none() {
        return Err("epub의 패키지 문서(OPF)를 찾지 못했습니다".into());
    }
    let opf = read_text(&zip, &opf_path)?;
    let odoc = roxmltree::Document::parse(&opf)
        .map_err(|_| "epub의 패키지 문서(OPF)를 읽지 못했습니다".to_string())?;
    let opf_dir = dir_of(&opf_path).to_string();
    let root = odoc.root_element();

    let mut title = None;
    let mut authors = Vec::new();
    let mut cover_meta = None;
    if let Some(md) = children(root, "metadata").next() {
        for n in md.children().filter(|n| n.is_element()) {
            match n.tag_name().name() {
                "title" if title.is_none() => title = Some(text_of(n)).filter(|t| !t.is_empty()),
                "creator" => {
                    let a = text_of(n);
                    if !a.is_empty() {
                        authors.push(a);
                    }
                }
                "meta" if attr(n, "name") == Some("cover") => {
                    cover_meta = attr(n, "content").map(str::to_string)
                }
                _ => {}
            }
        }
    }
    let mut manifest = Manifest::new();
    if let Some(m) = children(root, "manifest").next() {
        for it in children(m, "item") {
            if let (Some(id), Some(href)) = (attr(it, "id"), attr(it, "href")) {
                manifest.insert(
                    id.to_string(),
                    Item {
                        href: href.to_string(),
                        media_type: attr(it, "media-type").unwrap_or("").to_string(),
                        properties: attr(it, "properties").unwrap_or("").to_string(),
                    },
                );
            }
        }
    }
    let spine = children(root, "spine").next();
    let toc_id = spine.and_then(|s| attr(s, "toc"));
    let titles = toc_titles(&zip, &opf_dir, &manifest, toc_id);
    let mut chapters = Vec::new();
    if let Some(s) = spine {
        for r in children(s, "itemref") {
            let Some(item) = attr(r, "idref").and_then(|id| manifest.get(id)) else {
                continue;
            };
            let Some(p) = resolve(&opf_dir, &item.href) else {
                continue;
            };
            if size_of(&zip, &p).is_none() {
                continue;
            }
            let n = chapters.len() + 1;
            let t = titles
                .get(&p)
                .cloned()
                .unwrap_or_else(|| format!("챕터 {n}"));
            chapters.push((p, t));
        }
    }
    if chapters.is_empty() {
        return Err("epub에 읽을 수 있는 챕터가 없습니다".into());
    }
    let cover_item = manifest
        .values()
        .find(|m| m.properties.split_whitespace().any(|p| p == "cover-image"))
        .or_else(|| cover_meta.as_deref().and_then(|id| manifest.get(id)));
    let cover = cover_item.and_then(|i| resolve(&opf_dir, &i.href));
    Ok(Book {
        zip,
        title,
        author: (!authors.is_empty()).then(|| authors.join(", ")),
        cover,
        chapters,
    })
}

fn image_url(zip: &Archive, zip_path: &str, limit: u64) -> Option<String> {
    if size_of(zip, zip_path)? > limit {
        return None;
    }
    td_vfs::image_data_url(zip_path, &zip.read(zip_path).ok()?)
}

pub fn open(path: &Path, image_limit: u64) -> Result<EpubInfoDto, String> {
    let book = load(path)?;
    let cover = book
        .cover
        .as_deref()
        .and_then(|c| image_url(&book.zip, c, image_limit));
    Ok(EpubInfoDto {
        title: book.title,
        author: book.author,
        cover,
        chapters: book
            .chapters
            .into_iter()
            .map(|(_, title)| EpubChapterDto { title })
            .collect(),
    })
}

/// 태그 시작(`<name`) 위치마다 태그 전체(`<`부터 `>`까지, 따옴표 안의 `>`는 건너뜀)를 `f`에 넘기고, `Some(대체)`면 바꾼다.
fn map_tags(html: &str, name: &str, mut f: impl FnMut(&str) -> Option<String>) -> String {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{name}");
    let b = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut at = 0;
    while let Some(rel) = lower[at..].find(&open) {
        let start = at + rel;
        let after = start + open.len();
        let boundary = b
            .get(after)
            .is_none_or(|c| c.is_ascii_whitespace() || *c == b'>' || *c == b'/');
        if !boundary {
            out.push_str(&html[at..after]);
            at = after;
            continue;
        }
        let mut i = after;
        let mut quote = 0u8;
        while i < b.len() {
            let c = b[i];
            if quote != 0 {
                if c == quote {
                    quote = 0;
                }
            } else if c == b'"' || c == b'\'' {
                quote = c;
            } else if c == b'>' {
                break;
            }
            i += 1;
        }
        let end = (i + 1).min(html.len());
        out.push_str(&html[at..start]);
        let tag = &html[start..end];
        match f(tag) {
            Some(r) => out.push_str(&r),
            None => out.push_str(tag),
        }
        at = end;
    }
    out.push_str(&html[at..]);
    out
}

/// 태그 문자열에서 속성 값을 찾는다. 반환은 (값 시작, 값 끝)의 바이트 범위다.
fn attr_range(tag: &str, name: &str) -> Option<(usize, usize)> {
    let lower = tag.to_ascii_lowercase();
    let b = tag.as_bytes();
    let mut from = 0;
    while let Some(rel) = lower[from..].find(name) {
        let s = from + rel;
        let before_ok = s > 0 && (b[s - 1].is_ascii_whitespace());
        let mut i = s + name.len();
        from = i;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if !before_ok || b.get(i) != Some(&b'=') {
            continue;
        }
        i += 1;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        let q = *b.get(i)?;
        if q != b'"' && q != b'\'' {
            return None;
        }
        let vs = i + 1;
        let ve = tag[vs..].find(q as char)? + vs;
        return Some((vs, ve));
    }
    None
}

fn attr_value<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    attr_range(tag, name).map(|(s, e)| &tag[s..e])
}

fn strip_scripts(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut at = 0;
    while let Some(rel) = lower[at..].find("<script") {
        let s = at + rel;
        out.push_str(&html[at..s]);
        let Some(gt) = lower[s..].find('>') else {
            return out;
        };
        let tag_end = s + gt + 1;
        if lower[s..tag_end].ends_with("/>") {
            at = tag_end;
            continue;
        }
        at = match lower[tag_end..].find("</script>") {
            Some(c) => tag_end + c + "</script>".len(),
            None => return out,
        };
    }
    out.push_str(&html[at..]);
    out
}

pub fn chapter(path: &Path, index: u32, image_limit: u64) -> Result<String, String> {
    let book = load(path)?;
    let Some((zip_path, _)) = book.chapters.get(index as usize) else {
        return Err("챕터 번호가 범위를 벗어났습니다".into());
    };
    if size_of(&book.zip, zip_path).is_some_and(|s| s > MAX_CHAPTER) {
        return Err("챕터가 너무 커서(2MB 초과) 미리 볼 수 없습니다".into());
    }
    let dir = dir_of(zip_path).to_string();
    let html = read_text(&book.zip, zip_path)?;
    let html = strip_scripts(&html);
    let zip = &book.zip;
    let swap_src = |tag: &str, name: &str| -> Option<String> {
        let (s, e) = attr_range(tag, name)?;
        let p = resolve(&dir, &tag[s..e])?;
        let url = image_url(zip, &p, image_limit)?;
        Some(format!("{}{}{}", &tag[..s], url, &tag[e..]))
    };
    let html = map_tags(&html, "img", |tag| swap_src(tag, "src"));
    let html = map_tags(&html, "image", |tag| {
        swap_src(tag, "xlink:href").or_else(|| swap_src(tag, "href"))
    });
    let html = map_tags(&html, "link", |tag| {
        let rel = attr_value(tag, "rel")?;
        if !rel
            .to_ascii_lowercase()
            .split_whitespace()
            .any(|r| r == "stylesheet")
        {
            return None;
        }
        let p = resolve(&dir, attr_value(tag, "href")?)?;
        if size_of(zip, &p)? > MAX_CSS {
            return None;
        }
        let css = read_text(zip, &p).ok()?;
        Some(format!(
            "<style>{}</style>",
            css.replace("</style", "<\\/style")
        ))
    });
    Ok(html)
}

#[cfg(test)]
mod tests {
    use super::*;
    use td_archive::{Source, ZipEdit};

    const PNG: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
    ];

    fn build(dir: &Path, name: &str, files: &[(&str, Vec<u8>)]) -> std::path::PathBuf {
        let dest = dir.join(name);
        let mut z = ZipEdit::create(&dest).unwrap();
        for (n, body) in files {
            z.add_file(n, Source::Bytes(body.clone()));
        }
        z.commit().unwrap();
        dest
    }

    fn s(x: &str) -> Vec<u8> {
        x.as_bytes().to_vec()
    }

    const CONTAINER: &str = r#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#;

    fn epub3(dir: &Path) -> std::path::PathBuf {
        let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>한 권의 책</dc:title><dc:creator>김저자</dc:creator><dc:creator>이공저</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover%20art.png" media-type="image/png" properties="cover-image"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>"#;
        let nav = r#"<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">첫 장</a></li><li><a href="text/ch2.xhtml#s1">둘째 장</a></li></ol></nav></body></html>"#;
        let ch1 = r#"<html><head><link rel="stylesheet" href="../style.css"/><script>alert(1)</script></head><body><h1>1</h1><img alt="x" src="../images/cover%20art.png"/><img src='../images/missing.png'/><img src="https://example.com/a.png"/><script src="x.js"/></body></html>"#;
        build(
            dir,
            "v3.epub",
            &[
                ("mimetype", s("application/epub+zip")),
                ("META-INF/container.xml", s(CONTAINER)),
                ("OEBPS/content.opf", s(opf)),
                ("OEBPS/nav.xhtml", s(nav)),
                ("OEBPS/text/ch1.xhtml", s(ch1)),
                ("OEBPS/text/ch2.xhtml", s("<html><body>2</body></html>")),
                ("OEBPS/images/cover art.png", PNG.to_vec()),
                ("OEBPS/style.css", s("body{color:red}")),
            ],
        )
    }

    fn epub2(dir: &Path) -> std::path::PathBuf {
        let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>옛 책</dc:title><meta name="cover" content="cv"/></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.html" media-type="application/xhtml+xml"/><item id="b" href="b.html" media-type="application/xhtml+xml"/><item id="cv" href="cover.png" media-type="image/png"/></manifest><spine toc="ncx"><itemref idref="a"/><itemref idref="b"/></spine></package>"#;
        let ncx = r#"<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>서문</text></navLabel><content src="a.html"/></navPoint></navMap></ncx>"#;
        build(
            dir,
            "v2.epub",
            &[
                (
                    "META-INF/container.xml",
                    s(CONTAINER
                        .replace("OEBPS/content.opf", "content.opf")
                        .as_str()),
                ),
                ("content.opf", s(opf)),
                ("toc.ncx", s(ncx)),
                ("a.html", s("<html><body>a</body></html>")),
                ("b.html", s("<html><body>b</body></html>")),
                ("cover.png", PNG.to_vec()),
            ],
        )
    }

    #[test]
    fn epub3_metadata_cover_and_chapters_in_spine_order() {
        let t = tempfile::tempdir().unwrap();
        let info = open(&epub3(t.path()), 10 << 20).unwrap();
        assert_eq!(info.title.as_deref(), Some("한 권의 책"));
        assert_eq!(info.author.as_deref(), Some("김저자, 이공저"));
        assert!(info
            .cover
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let titles: Vec<_> = info.chapters.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(titles, ["첫 장", "둘째 장"]);
    }

    #[test]
    fn epub2_uses_ncx_titles_meta_cover_and_numbered_fallback() {
        let t = tempfile::tempdir().unwrap();
        let info = open(&epub2(t.path()), 10 << 20).unwrap();
        assert_eq!(info.title.as_deref(), Some("옛 책"));
        assert_eq!(info.author, None);
        assert!(info
            .cover
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let titles: Vec<_> = info.chapters.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(titles, ["서문", "챕터 2"]);
    }

    #[test]
    fn cover_over_image_limit_is_left_out() {
        let t = tempfile::tempdir().unwrap();
        let info = open(&epub3(t.path()), 4).unwrap();
        assert!(info.cover.is_none());
        assert_eq!(info.chapters.len(), 2);
    }

    #[test]
    fn chapter_inlines_images_and_css_and_drops_scripts() {
        let t = tempfile::tempdir().unwrap();
        let html = chapter(&epub3(t.path()), 0, 10 << 20).unwrap();
        assert!(html.contains("src=\"data:image/png;base64,"), "{html}");
        assert!(html.contains("<style>body{color:red}</style>"), "{html}");
        assert!(!html.to_lowercase().contains("<script"), "{html}");
        assert!(!html.contains("alert(1)"));
        // 없는 이미지와 바깥 주소는 그대로 둔다.
        assert!(html.contains("src='../images/missing.png'"));
        assert!(html.contains("https://example.com/a.png"));
    }

    #[test]
    fn chapter_image_over_limit_stays_as_is() {
        let t = tempfile::tempdir().unwrap();
        let html = chapter(&epub3(t.path()), 0, 4).unwrap();
        assert!(html.contains("../images/cover%20art.png"));
        assert!(!html.contains("data:image/png"));
    }

    #[test]
    fn chapter_index_out_of_range_is_error() {
        let t = tempfile::tempdir().unwrap();
        let p = epub3(t.path());
        assert!(chapter(&p, 2, 10 << 20).unwrap_err().contains("범위"));
    }

    #[test]
    fn not_a_zip_and_missing_container_are_errors() {
        let t = tempfile::tempdir().unwrap();
        let plain = t.path().join("a.epub");
        std::fs::write(&plain, "hello").unwrap();
        assert!(open(&plain, 1 << 20).unwrap_err().contains("ZIP"));
        let none = build(t.path(), "n.epub", &[("a.txt", s("x"))]);
        assert!(open(&none, 1 << 20).unwrap_err().contains("container"));
    }

    #[test]
    fn drm_is_rejected_but_font_obfuscation_is_not() {
        let t = tempfile::tempdir().unwrap();
        let enc = |alg: &str| {
            format!(
                r#"<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="{alg}"/></enc:EncryptedData></encryption>"#
            )
        };
        let base = |name: &str, alg: &str| {
            let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>t</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>"#;
            build(
                t.path(),
                name,
                &[
                    (
                        "META-INF/container.xml",
                        s(CONTAINER
                            .replace("OEBPS/content.opf", "content.opf")
                            .as_str()),
                    ),
                    ("META-INF/encryption.xml", s(&enc(alg))),
                    ("content.opf", s(opf)),
                    ("c.xhtml", s("<html/>")),
                ],
            )
        };
        let drm = base("drm.epub", "http://www.w3.org/2001/04/xmlenc#aes128-cbc");
        assert!(open(&drm, 1 << 20).unwrap_err().contains("DRM"));
        let fonts = base("fonts.epub", "http://www.idpf.org/2008/embedding");
        assert!(open(&fonts, 1 << 20).is_ok());
    }

    #[test]
    fn oversized_chapter_is_error() {
        let t = tempfile::tempdir().unwrap();
        let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>t</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>"#;
        let p = build(
            t.path(),
            "big.epub",
            &[
                (
                    "META-INF/container.xml",
                    s(CONTAINER
                        .replace("OEBPS/content.opf", "content.opf")
                        .as_str()),
                ),
                ("content.opf", s(opf)),
                ("c.xhtml", vec![b'a'; (MAX_CHAPTER + 1) as usize]),
            ],
        );
        assert!(open(&p, 1 << 20).is_ok());
        assert!(chapter(&p, 0, 1 << 20).unwrap_err().contains("2MB"));
    }

    #[test]
    fn paths_escaping_the_archive_are_not_resolved() {
        assert_eq!(
            resolve("OEBPS/text", "../images/a.png").as_deref(),
            Some("OEBPS/images/a.png")
        );
        assert_eq!(resolve("OEBPS", "../../x.png"), None);
        assert_eq!(resolve("", "../x.png"), None);
        assert_eq!(resolve("a", "/etc/passwd"), None);
        assert_eq!(resolve("a", "https://x/y.png"), None);
        assert_eq!(resolve("a", "data:image/png;base64,AA"), None);
        assert_eq!(resolve("a", "b%20c.png#f").as_deref(), Some("a/b c.png"));
    }

    #[test]
    fn spine_item_escaping_the_archive_is_skipped() {
        let t = tempfile::tempdir().unwrap();
        let opf = r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>t</dc:title></metadata><manifest><item id="e" href="../../x.xhtml" media-type="application/xhtml+xml"/><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="e"/><itemref idref="c"/></spine></package>"#;
        let p = build(
            t.path(),
            "esc.epub",
            &[
                (
                    "META-INF/container.xml",
                    s(CONTAINER
                        .replace("OEBPS/content.opf", "content.opf")
                        .as_str()),
                ),
                ("content.opf", s(opf)),
                ("c.xhtml", s("<html>ok</html>")),
            ],
        );
        let info = open(&p, 1 << 20).unwrap();
        assert_eq!(info.chapters.len(), 1);
        assert_eq!(chapter(&p, 0, 1 << 20).unwrap(), "<html>ok</html>");
    }
}
