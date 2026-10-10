import { beforeEach, describe, expect, it } from "vitest";
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

  it("조합이 끝나면 textarea 값을 비운다", () => {
    ta.value = "한";
    comp("compositionstart");
    comp("compositionend", "한");
    expect(ta.value).toBe("");
  });
});
