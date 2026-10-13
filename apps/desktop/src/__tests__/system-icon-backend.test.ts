import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";

// FakeBackend의 시스템 아이콘 응답: 확장자(폴더는 dir)별로 다른 PNG 데이터 주소, 호출 기록, 응답기로 null·거부 흉내.
describe("FakeBackend systemIcon", () => {
  it("확장자별로 다른 PNG 데이터 주소를 돌려주고 같은 확장자는 같다", async () => {
    const b = new FakeBackend();
    const txt = await b.systemIcon("/a/x.txt", false, 32);
    const png = await b.systemIcon("/a/y.png", false, 32);
    const dir = await b.systemIcon("/a/d", true, 32);
    expect(txt).toMatch(/^data:image\/png;base64,/);
    expect(new Set([txt, png, dir]).size).toBe(3);
    expect(await b.systemIcon("/b/z.TXT", false, 32)).toBe(txt);
  });

  it("호출을 기록한다(경로·폴더 여부·크기)", async () => {
    const b = new FakeBackend();
    await b.systemIcon("/a/x.txt", false, 64);
    await b.systemIcon("/a/d", true, 16);
    expect(b.systemIconCalls).toEqual([
      { path: "/a/x.txt", isDir: false, size: 64 },
      { path: "/a/d", isDir: true, size: 16 },
    ]);
  });

  it("응답기로 null과 거부를 흉내 낸다", async () => {
    const b = new FakeBackend();
    b.systemIconResponder = async () => null;
    expect(await b.systemIcon("/a/x.txt", false, 32)).toBeNull();
    b.systemIconResponder = async () => {
      throw new Error("실패");
    };
    await expect(b.systemIcon("/a/x.txt", false, 32)).rejects.toThrow("실패");
  });
});
