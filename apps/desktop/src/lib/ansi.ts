/** 셸 출력의 ANSI SGR 색을 조각으로 나눈다(이슈 #157). 순수 함수. 16색 전경·굵게·흐리게만 해석하고 그 밖의 CSI는 지운다. */

/** 같은 모양으로 그릴 글 조각. `fg`는 ANSI 16색 번호(0–7 기본색, 8–15 밝은색)이고 없으면 기본 글자색이다. */
export interface AnsiSpan {
  text: string;
  fg?: number;
  bold?: boolean;
  dim?: boolean;
}

// 제어 시퀀스 한 개: CSI(ESC [ …), OSC(ESC ] … BEL 또는 ESC \), 그 밖의 ESC 시퀀스(ESC 중간바이트* 최종바이트, 예: ESC ( B · ESC 7).
const SEQUENCE = /\x1b(?:\[([0-?]*)[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[ -/]*[0-~])/g;
// 맨 앞에서 ESC가 잘려 나간 시퀀스(`[31m`). 파라미터 숫자가 있거나 `[m`일 때만 시퀀스로 본다.
const LEADING_HALF = /^\[(?:[0-9;]+[A-Za-z]|m)/;
// 끝에서 끝나지 못한 시퀀스(`ESC`, `ESC[3`, `ESC]8;;http`, `ESC(`).
const TRAILING_PARTIAL = /\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*\x1b?|[ -/]*)?$/;

const clean = (text: string) => text.replace(LEADING_HALF, "").replace(TRAILING_PARTIAL, "");

/** 글에서 모든 제어 시퀀스를 지우고 `\r` 덮어쓰기를 적용한 화면 글자(복사용). */
export function stripAnsi(text: string): string {
  return parseAnsi(text).map((s) => s.text).join("");
}

export function parseAnsi(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let fg: number | undefined;
  let bold = false;
  let dim = false;
  type Cell = { ch: string; fg?: number; bold?: boolean; dim?: boolean };
  const done: Cell[] = [];
  let line: Cell[] = [];
  let col = 0;
  // 글자를 현재 줄의 커서 자리에 쓴다. 줄바꿈은 줄을 끝내고, `\r\n`이 아닌 `\r`은 같은 줄 처음으로 돌아간다(뒤 글자가 앞을 덮는다).
  const write = (chunk: string) => {
    const chars = [...chunk];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === "\r") {
        if (chars[i + 1] !== "\n") col = 0;
        continue;
      }
      const cell: Cell = { ch };
      if (fg !== undefined) cell.fg = fg;
      if (bold) cell.bold = true;
      if (dim) cell.dim = true;
      if (ch === "\n") {
        for (const c of line) done.push(c);
        done.push(cell);
        line = [];
        col = 0;
      } else line[col++] = cell;
    }
  };
  const sgr = (params: string) => {
    const codes = params === "" ? [0] : params.split(";").map((p) => (p === "" ? 0 : Number(p)));
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { fg = undefined; bold = false; dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) { bold = false; dim = false; }
      else if (c >= 30 && c <= 37) fg = c - 30;
      else if (c >= 90 && c <= 97) fg = c - 90 + 8;
      else if (c === 39) fg = undefined;
      else if (c === 38 || c === 48 || c === 58) i += codes[i + 1] === 5 ? 2 : codes[i + 1] === 2 ? 4 : 0; // 256색·트루컬러의 인자를 건너뛴다
    }
  };
  const body = clean(text);
  let at = 0;
  for (const m of body.matchAll(SEQUENCE)) {
    write(body.slice(at, m.index));
    if (m[0].endsWith("m") && m[1] !== undefined && /^[0-9;]*$/.test(m[1])) sgr(m[1]);
    at = m.index + m[0].length;
  }
  write(body.slice(at));
  for (const c of done.concat(line)) {
    const last = spans.at(-1);
    if (last && last.fg === c.fg && last.bold === c.bold && last.dim === c.dim) last.text += c.ch;
    else spans.push({ text: c.ch, ...(c.fg !== undefined && { fg: c.fg }), ...(c.bold && { bold: true }), ...(c.dim && { dim: true }) });
  }
  return spans;
}
