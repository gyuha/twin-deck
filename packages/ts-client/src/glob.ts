/**
 * Select Group용 glob (Rust `td_vfs::glob_match`와 같은 규칙, 같은 케이스 표로 테스트한다).
 * `*` 임의 길이, `?` 한 글자, `[abc]` `[a-z]` `[!abc]`/`[^abc]`, 대소문자 무시, NFC 정규화.
 */
type Tok =
  | { t: "any" }
  | { t: "one" }
  | { t: "lit"; c: string }
  | { t: "class"; negate: boolean; items: [string, string][] };

const norm = (s: string) => [...s.normalize("NFC").toLowerCase()];

function parse(p: string[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (out.at(-1)?.t !== "any") out.push({ t: "any" });
    } else if (c === "?") out.push({ t: "one" });
    else if (c === "[") {
      let j = i + 1;
      const negate = p[j] === "!" || p[j] === "^";
      if (negate) j++;
      const start = j;
      const items: [string, string][] = [];
      let closed = false;
      while (j < p.length) {
        if (p[j] === "]" && j > start) {
          closed = true;
          break;
        }
        if (j + 2 < p.length && p[j + 1] === "-" && p[j + 2] !== "]") {
          items.push([p[j], p[j + 2]]);
          j += 3;
        } else {
          items.push([p[j], p[j]]);
          j += 1;
        }
      }
      if (closed) {
        out.push({ t: "class", negate, items });
        i = j;
      } else out.push({ t: "lit", c: "[" });
    } else out.push({ t: "lit", c });
  }
  return out;
}

const one = (tok: Tok, c: string): boolean => {
  switch (tok.t) {
    case "one":
      return true;
    case "lit":
      return tok.c === c;
    case "class":
      return tok.items.some(([a, b]) => a <= c && c <= b) !== tok.negate;
    default:
      return false;
  }
};

export function globMatch(pattern: string, name: string): boolean {
  const toks = parse(norm(pattern));
  const text = norm(name);
  let t = 0;
  let p = 0;
  let star: [number, number] | null = null;
  while (t < text.length) {
    const tok = toks[p];
    if (tok?.t === "any") {
      star = [p, t];
      p++;
    } else if (tok && one(tok, text[t])) {
      t++;
      p++;
    } else if (star) {
      p = star[0] + 1;
      t = star[1] + 1;
      star = [star[0], star[1] + 1];
    } else return false;
  }
  return toks.slice(p).every((x) => x.t === "any");
}
