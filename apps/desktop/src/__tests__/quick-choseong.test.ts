import { describe, expect, it } from "vitest";
import { NFD } from "./helpers";
import { quickMatch, quickMatchRange } from "../lib/names";

describe("빠른 선택 초성 검색: quickMatch", () => {
  it("초성만 입력해도 일치한다", () => {
    expect(quickMatch("한글 문서.txt", "ㅎㄱ")).toBe(true);
    expect(quickMatch("한글 문서.txt", "ㅁㅅ")).toBe(true); // 부분 일치
    expect(quickMatch("한글 문서.txt", "ㅎ")).toBe(true);
  });

  it("음절과 초성을 섞어도 일치한다", () => {
    expect(quickMatch("한글 문서.txt", "한ㄱ")).toBe(true);
    expect(quickMatch("한글 문서.txt", "한글 ㅁㅅ")).toBe(true); // 공백은 글자 그대로
  });

  it("자소가 풀린(NFD) 이름도 같다", () => {
    expect(quickMatch(NFD("한글 문서.txt"), "ㅎㄱ")).toBe(true);
  });

  it("초성이 다르거나 입력이 이름보다 길면 일치하지 않는다", () => {
    expect(quickMatch("한글", "ㄴㄱ")).toBe(false);
    expect(quickMatch("한글", "ㅎㄱㅁ")).toBe(false);
    expect(quickMatch("abc.txt", "ㅎ")).toBe(false);
    expect(quickMatch("한글 문서.txt", "한ㅁ")).toBe(false); // 음절 `한` 바로 뒤는 공백이다
  });

  it("접두 일치 설정이면 이름 앞에서만 일치한다", () => {
    expect(quickMatch("한글 문서.txt", "ㅎㄱ", true)).toBe(true);
    expect(quickMatch("문서 한글.txt", "ㅎㄱ", true)).toBe(false);
    expect(quickMatch("문서 한글.txt", "ㅎㄱ", false)).toBe(true);
    expect(quickMatch("한글", "ㅎㄱㅁ", true)).toBe(false); // 접두 일치에서 입력이 이름보다 길어도 안전하게 false
  });

  it("영문 입력은 기존처럼 대소문자를 무시한 부분 일치다", () => {
    expect(quickMatch("Readme.MD", "me.m")).toBe(true);
    expect(quickMatch("Readme.MD", "xyz")).toBe(false);
    expect(quickMatch(NFD("한글.txt"), "한글")).toBe(true); // 초성이 아닌 한글 입력도 그대로 된다
  });
});

describe("빠른 선택 초성 검색: quickMatchRange(하이라이트)", () => {
  it("일치한 음절 구간을 돌려준다", () => {
    expect(quickMatchRange("한글 문서.txt", "ㅎㄱ")).toEqual([0, 2]);
    expect(quickMatchRange("문서 한글.txt", "ㅎㄱ")).toEqual([3, 5]);
    expect(quickMatchRange("한글 문서.txt", "한ㄱ")).toEqual([0, 2]);
  });

  it("NFD 이름도 화면에 보이는(NFC) 이름 기준 구간이다", () => {
    expect(quickMatchRange(NFD("문서 한글.txt"), "ㅎㄱ")).toEqual([3, 5]);
  });

  it("접두 일치면 앞에서만, 일치하지 않으면 null이다", () => {
    expect(quickMatchRange("문서 한글.txt", "ㅎㄱ", true)).toBeNull();
    expect(quickMatchRange("abc", "ㅎ")).toBeNull();
  });
});
