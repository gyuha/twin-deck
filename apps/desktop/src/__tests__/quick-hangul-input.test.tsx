import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { NFD, cursorName, renderApp } from "./helpers";

const quickText = () => screen.queryByRole("status", { name: "빠른 선택" })?.querySelector("span")?.textContent ?? null;

const seed = () =>
  new FakeBackend().seed({
    "/home/a/한글 문서.txt": "d",
    [`/home/a/${NFD("한글 노트.txt")}`]: "n", // macOS/SMB처럼 자소가 풀린(NFD) 이름
    "/home/a/other.txt": "o",
    "/home/a/zip-a.txt": "z",
  });

describe("빠른 선택: 낱개 자모 입력(macOS 한글 IME)", () => {
  it("자모를 하나씩 입력하면 음절로 조립되어 막대에 보이고 일치한 행으로 간다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("ㅎㅏㄴㄱㅡㄹ");
    expect(quickText()).toBe("한글");
    await user.keyboard(" ㅁㅜㄴ");
    expect(quickText()).toBe("한글 문");
    expect(cursorName("left")).toBe("한글 문서.txt");
  });

  it("NFD로 저장된 이름도 같은 입력으로 찾는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("ㅎㅏㄴㄱㅡㄹ ㄴㅗ");
    expect(quickText()).toBe("한글 노");
    expect(cursorName("left")).toBe("한글 노트.txt");
  });

  it("Backspace는 자모 단위로 지운다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("ㅎㅏㄴㄱㅡㄹ");
    expect(quickText()).toBe("한글");
    await user.keyboard("{Backspace}");
    expect(quickText()).toBe("한그");
    await user.keyboard("{Backspace}");
    expect(quickText()).toBe("한ㄱ");
    await user.keyboard("{Backspace}");
    expect(quickText()).toBe("한");
  });

  it("영문 입력은 기존과 같다(한글 조립이 끼어들지 않는다)", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("zip");
    expect(quickText()).toBe("zip");
    expect(cursorName("left")).toBe("zip-a.txt");
    await user.keyboard("{Backspace}");
    expect(quickText()).toBe("zi");
  });
});
