import { afterEach, describe, expect, it } from "vitest";
import { BackendError, FakeBackend } from "@twin-deck/ts-client";
import { createAppStore } from "../state/store";
import { setLanguage } from "../i18n";

// Rust가 한국어 문자열로 돌려주는 오류가 영어에서는 영어로 보인다(이슈 #32).
afterEach(() => setLanguage("ko"));

describe("백엔드 오류 문구", () => {
  it("스토어를 만들면 BackendError가 화면 언어로 바뀐다", () => {
    createAppStore(new FakeBackend(), "/home/a", "/home/b");
    expect(new BackendError("폴더가 아닙니다: /x").message).toBe("폴더가 아닙니다: /x");
    setLanguage("en");
    expect(new BackendError("폴더가 아닙니다: /x").message).toBe("Not a folder: /x");
    expect(new BackendError("정체 모를 오류").message).toBe("정체 모를 오류");
  });
});
