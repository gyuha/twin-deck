import { describe, expect, it } from "vitest";
import { appendQuick, backspaceQuick } from "../lib/hangulInput";

const typed = (chars: string) => [...chars].reduce((buf, c) => appendQuick(buf, c), "");

describe("빠른 검색 입력 버퍼: 낱개 자모를 음절로 조립한다", () => {
  it("자모를 하나씩 이으면 음절이 된다", () => {
    expect(typed("ㅎㅏㄴ")).toBe("한");
    expect(typed("ㅎㅏㄴㄱㅡㄹ")).toBe("한글");
    expect(typed("ㅂㅏㅂ")).toBe("밥");
  });

  it("받침 뒤에 모음이 오면 받침이 다음 음절의 초성이 된다", () => {
    expect(typed("ㅎㅏㄴㄱㅡㄹ")).toBe("한글");
    expect(typed("ㅁㅜㄴㅅㅓ")).toBe("문서");
  });

  it("이미 조립된 음절과 영문은 그대로 이어 붙인다", () => {
    expect(appendQuick("한글", "a")).toBe("한글a");
    expect(typed("zip")).toBe("zip");
    expect(appendQuick("zip", "ㅎ")).toBe("zipㅎ");
    expect(appendQuick("한글 ", "ㅁ")).toBe("한글 ㅁ");
  });

  it("Backspace는 마지막 자모 하나씩 지운다", () => {
    expect(backspaceQuick("한글")).toBe("한그");
    expect(backspaceQuick("한그")).toBe("한ㄱ");
    expect(backspaceQuick("한ㄱ")).toBe("한");
    expect(backspaceQuick("한")).toBe("하");
    expect(backspaceQuick("하")).toBe("ㅎ");
    expect(backspaceQuick("ㅎ")).toBe("");
  });

  it("영문과 빈 버퍼의 Backspace는 기존처럼 한 글자를 지운다", () => {
    expect(backspaceQuick("zip")).toBe("zi");
    expect(backspaceQuick("a")).toBe("");
    expect(backspaceQuick("")).toBe("");
  });
});
