//! Office 문서(docx·xlsx·pptx와 구형 doc·xls·ppt)를 `office_oxide`로 읽어 Markdown으로 바꾼다.
//! 문서 모습이 아니라 글자와 표만 뽑는 데이터 미리보기다.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

/// 이보다 큰 파일은 읽지 않는다(메모리와 압축 해제 시간 제한).
const MAX_FILE: u64 = 20 * 1024 * 1024;
/// 결과 Markdown이 이보다 길면 글자 경계에서 자른다.
const MAX_MARKDOWN: usize = 512 * 1024;

const EXTS: [&str; 9] = [
    "docx", "xlsx", "pptx", "doc", "xls", "ppt", "docm", "xlsm", "pptm",
];

/// Office 문서에서 뽑은 내용. `truncated`면 `markdown`은 앞부분이다.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct OfficePreviewDto {
    pub markdown: String,
    pub truncated: bool,
}

/// 확장자(대소문자 무시)가 지원하는 Office 형식인가.
pub fn is_office(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)))
}

/// 디스크 위 Office 문서를 Markdown으로 바꾼다. 형식이 아니거나 크거나 망가진 파일은 오류다.
pub fn preview(path: &Path) -> Result<OfficePreviewDto, String> {
    if !is_office(path) {
        return Err("Office 문서가 아닙니다".into());
    }
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE {
        return Err("파일이 너무 커서(20MB 초과) 미리 볼 수 없습니다".into());
    }
    let doc = office_oxide::Document::open(path)
        .map_err(|e| format!("Office 문서를 읽을 수 없습니다: {e}"))?;
    let mut markdown = doc.to_markdown();
    let truncated = markdown.len() > MAX_MARKDOWN;
    if truncated {
        let mut end = MAX_MARKDOWN;
        while !markdown.is_char_boundary(end) {
            end -= 1;
        }
        markdown.truncate(end);
    }
    Ok(OfficePreviewDto {
        markdown,
        truncated,
    })
}
