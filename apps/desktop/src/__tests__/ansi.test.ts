import { describe, expect, it } from "vitest";
import { parseAnsi, stripAnsi } from "../lib/ansi";

const E = "\x1b";

describe("ANSI 해석기 (parseAnsi)", () => {
  const cases: Array<[string, string, ReturnType<typeof parseAnsi>]> = [
    ["색 없는 글은 한 조각", "hello", [{ text: "hello" }]],
    ["빈 글은 조각이 없다", "", []],
    ["전경 30–37은 0–7번", `${E}[31mred${E}[0m`, [{ text: "red", fg: 1 }]],
    ["밝은 전경 90–97은 8–15번", `${E}[92mok${E}[0m`, [{ text: "ok", fg: 10 }]],
    ["39는 전경색만 되돌린다", `${E}[1;31ma${E}[39mb`, [{ text: "a", fg: 1, bold: true }, { text: "b", bold: true }]],
    ["0은 모두 초기화한다", `${E}[1;2;32ma${E}[0mb`, [{ text: "a", fg: 2, bold: true, dim: true }, { text: "b" }]],
    ["파라미터가 빈 ESC[m은 0과 같다", `${E}[31ma${E}[mb`, [{ text: "a", fg: 1 }, { text: "b" }]],
    ["22는 굵게와 흐리게를 끈다", `${E}[1;2ma${E}[22mb`, [{ text: "a", bold: true, dim: true }, { text: "b" }]],
    ["한 시퀀스의 여러 코드를 순서대로 적용한다", `${E}[1;33mwarn`, [{ text: "warn", fg: 3, bold: true }]],
    ["256색 38;5;n은 지우고 상태는 그대로", `${E}[38;5;196mx`, [{ text: "x" }]],
    ["트루컬러 38;2;r;g;b는 인자까지 소비한다", `${E}[38;2;1;2;3;1mx`, [{ text: "x", bold: true }]],
    ["38;5;n 뒤의 코드는 계속 적용한다", `${E}[38;5;4;31mx`, [{ text: "x", fg: 1 }]],
    ["배경색은 지우고 무시한다", `${E}[41mx`, [{ text: "x" }]],
    ["커서 이동·지우기 같은 다른 CSI는 지운다", `a${E}[2Kb${E}[3Ac${E}[?25lz`, [{ text: "abcz" }]],
    ["맨 앞의 잘린 반쪽 시퀀스는 버린다", `[31mred${E}[0m after`, [{ text: "red after" }]],
    ["끝의 미완성 시퀀스는 버린다", `abc${E}[3`, [{ text: "abc" }]],
    ["끝의 ESC 하나도 버린다", `abc${E}`, [{ text: "abc" }]],
    ["OSC 8 링크는 링크 글자만 남기고 BEL로 끝난다", `${E}]8;;https://x.io\x07link${E}]8;;\x07 end`, [{ text: "link end" }]],
    ["OSC는 ST(ESC \\)로도 끝난다", `${E}]0;title${E}\\body`, [{ text: "body" }]],
    ["끝의 미완성 OSC는 버린다", `abc${E}]8;;http`, [{ text: "abc" }]],
    ["끝에서 ESC만 닫힌 OSC도 버린다", `abc${E}]8;;http${E}`, [{ text: "abc" }]],
    ["ESC 뒤 한 글자 시퀀스를 지운다", `a${E}7b${E}=c${E}>d`, [{ text: "abcd" }]],
    ["ESC ( B 같은 문자 집합 지정도 지운다", `a${E}(Bb`, [{ text: "ab" }]],
    ["끝의 ESC ( 도 버린다", `ab${E}(`, [{ text: "ab" }]],
    ["\\r\\n은 줄바꿈이다", "a\r\nb\r\n", [{ text: "a\nb\n" }]],
    ["줄 안의 \\r은 처음으로 돌아가 덮어쓴다", "진행 10%\r진행 100%", [{ text: "진행 100%" }]],
    ["덮는 글자가 짧으면 남은 앞부분을 유지한다", "abcdef\rXY", [{ text: "XYcdef" }]],
    ["\\r로 덮는 줄은 그 줄만 바뀐다", "one\ntwo\rTW\nthree", [{ text: "one\nTWo\nthree" }]],
    ["색이 섞여도 덮어쓴 자리의 색을 따른다", `ab${E}[31mcd${E}[0m\r${E}[32mXY${E}[0m`, [{ text: "XY", fg: 2 }, { text: "cd", fg: 1 }]],
    ["줄바꿈은 글자 그대로 둔다", `${E}[32mone\ntwo${E}[0m\n`, [{ text: "one\ntwo", fg: 2 }, { text: "\n" }]],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    expect(parseAnsi(input)).toEqual(expected);
  });
});

describe("ANSI 제거 (stripAnsi)", () => {
  it.each([
    ["색 코드를 지운다", `${E}[1;31mfatal${E}[0m: x`, "fatal: x"],
    ["지원 밖 시퀀스도 지운다", `a${E}[38;5;1mb${E}[2K`, "ab"],
    ["앞의 잘린 시퀀스와 끝의 미완성 시퀀스도 지운다", `[32mok${E}[0m${E}[`, "ok"],
    ["OSC와 두 글자 ESC 시퀀스도 지운다", `${E}]8;;u\x07L${E}]8;;\x07${E}(B${E}7`, "L"],
    ["\\r로 덮은 글자는 복사에도 덮은 결과만 남는다", "10%\r100%\n", "100%\n"],
    ["ANSI가 없으면 그대로", "[ERROR] 2024", "[ERROR] 2024"],
  ])("%s", (_name, input, expected) => {
    expect(stripAnsi(input)).toBe(expected);
  });
});
