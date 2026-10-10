import { beforeEach, describe, expect, it, vi } from "vitest";
import { installImeBridge } from "../lib/imeBridge";

// xterm 대신 같은 모양(host > textarea)을 만들고, xterm의 리스너가 받는지·우리가 보내는지 본다.
let host: HTMLDivElement;
let ta: HTMLTextAreaElement;
let sent: string[];
let seenByXterm: string[];

const comp = (type: string, data = "") => ta.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, cancelable: true }));
const key = (init: KeyboardEventInit & { keyCode?: number }) => {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(e, "keyCode", { value: init.keyCode });
  ta.dispatchEvent(e);
};

/** IME가 가져간 키(keyCode 229)가 눌렸다. */
const imeKey229 = () => key({ keyCode: 229, key: "Process" });
const input = (inputType: string, data: string) => {
  ta.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data }));
  ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
};
/** 셸이 받은 바이트를 줄 편집기처럼 적용한다(DEL은 앞 글자를 지운다). */
const typeShell = () => (chunks: string[]) => {
  let line = "";
  for (const c of chunks) for (const ch of c) line = ch === "\x7f" ? line.slice(0, -1) : line + ch;
  return line;
};

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  ta = document.createElement("textarea");
  host.appendChild(ta);
  document.body.appendChild(host);
  sent = [];
  seenByXterm = [];
  // xterm이 textarea에 단 리스너를 흉내 낸다(target 단계).
  for (const t of ["compositionstart", "compositionupdate", "compositionend", "keydown", "input", "beforeinput"]) ta.addEventListener(t, () => seenByXterm.push(t));
  installImeBridge(host, (t) => sent.push(t));
});

describe("터미널 한글(IME) 브리지", () => {
  it("조합이 끝나면 확정된 글만 보낸다: 한 음절씩, 자음·모음이 빠지지 않는다", () => {
    for (const [data, final] of [["ㅎ", ""], ["하", ""], ["한", "한"]] as const) {
      comp("compositionstart");
      comp("compositionupdate", data);
      if (final) comp("compositionend", final);
    }
    comp("compositionstart");
    comp("compositionupdate", "글");
    comp("compositionend", "글");
    expect(sent).toEqual(["한", "글"]);
  });

  it("조합 이벤트는 xterm 리스너에 닿지 않는다(같은 글이 두 번 가지 않는다)", () => {
    comp("compositionstart");
    comp("compositionupdate", "하");
    key({ keyCode: 229, key: "Process" });
    ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "하" }));
    comp("compositionend", "하");
    ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "하" })); // 끝난 직후의 input
    expect(seenByXterm).toEqual([]);
    expect(sent).toEqual(["하"]);
  });

  it("조합 중인 글은 표시로 보이고 확정되면 사라진다", () => {
    const preview = () => host.querySelector<HTMLElement>("[data-ime-preview]")!;
    comp("compositionstart");
    comp("compositionupdate", "하");
    expect(preview().textContent).toBe("하");
    expect(preview().style.display).toBe("block");
    comp("compositionend", "한");
    expect(preview().style.display).toBe("none");
    expect(preview().textContent).toBe("");
  });

  it("조합이 아닌 일반 키 입력은 건드리지 않는다", () => {
    key({ key: "a", keyCode: 65 });
    key({ key: "Enter", keyCode: 13 });
    expect(seenByXterm).toEqual(["keydown", "keydown"]);
    expect(sent).toEqual([]);
  });

  it("WebKit 방식: insertText로 첫 자모, insertReplacementText로 이어지는 자모가 오면 교체해서 `한글`이 완성된다", () => {
    const shell = typeShell();
    // ㅎ ㅏ ㄴ ㄱ ㅡ ㄹ — 실제 웹뷰가 보낸 순서(캡처): 첫 자모는 insertText, 이어지는 것은 insertReplacementText
    imeKey229();
    input("insertText", "ㅎ");
    imeKey229();
    input("insertReplacementText", "하");
    imeKey229();
    input("insertReplacementText", "한");
    imeKey229();
    input("insertText", "ㄱ"); // 다음 음절이 시작된다
    imeKey229();
    input("insertReplacementText", "그");
    imeKey229();
    input("insertReplacementText", "글");
    expect(shell(sent)).toBe("한글");
    expect(seenByXterm.filter((t) => t === "input" || t === "beforeinput")).toEqual([]); // xterm은 이 입력을 보지 못한다
  });

  it("받침이 다음 음절로 넘어가는 교체(달 + ㅏ → 다라)도 맞다", () => {
    const shell = typeShell();
    imeKey229();
    input("insertText", "ㄷ");
    imeKey229();
    input("insertReplacementText", "다");
    imeKey229();
    input("insertReplacementText", "달");
    imeKey229();
    input("insertReplacementText", "다"); // ㅏ가 오면 ㄹ이 다음 음절로 넘어간다
    imeKey229();
    input("insertText", "라");
    expect(shell(sent)).toBe("다라");
  });

  it("조합 중 글자를 Backspace로 지우면 셸에서도 지워진다", () => {
    const shell = typeShell();
    imeKey229();
    input("insertText", "ㅎ");
    imeKey229();
    input("insertReplacementText", "하");
    imeKey229();
    input("insertReplacementText", "ㅎ"); // Backspace: 하 → ㅎ
    imeKey229();
    input("deleteContentBackward", "");
    expect(shell(sent)).toBe("");
  });

  it("IME가 아닌 키(영문, Enter 등)의 input은 xterm에 그대로 맡기고 textarea를 비운다", () => {
    imeKey229();
    input("insertText", "ㅎ");
    ta.value = "ㅎ";
    key({ key: "Enter", keyCode: 13 }); // 일반 키: 조합은 끝났다
    expect(ta.value).toBe("");
    ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    expect(seenByXterm).toContain("input"); // xterm이 받는다
    expect(sent).toEqual(["ㅎ"]); // 우리가 보낸 것은 ㅎ뿐
  });

  it("진단 표시: Ctrl+Alt+Shift+I로 켜면 이벤트 순서와 보낸 글이 보인다", () => {
    const box = () => host.querySelector<HTMLElement>("[data-ime-log]")!;
    expect(box().style.display).toBe("none");
    key({ ctrlKey: true, altKey: true, shiftKey: true, code: "KeyI", key: "I" });
    expect(box().style.display).toBe("block");
    comp("compositionstart");
    comp("compositionupdate", "하");
    comp("compositionend", "하");
    expect(box().textContent).toContain("compositionupdate");
    expect(box().textContent).toContain('SEND "하"');
    key({ ctrlKey: true, altKey: true, shiftKey: true, code: "KeyI", key: "I" });
    expect(box().style.display).toBe("none");
  });

});
