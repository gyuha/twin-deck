import { describe, expect, it } from "vitest";
import type { TerminalEvent } from "./backend";
import { FakeBackend } from "./fake";
import { decodeBase64 } from "./tauri";

describe("터미널: base64 출력 → 바이트", () => {
  it("글자 중간에서 잘린 UTF-8도 바이트 그대로 풀어 이어 붙이면 원래 글이 된다", () => {
    const bytes = new TextEncoder().encode("안녕 터미널");
    const enc = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const a = decodeBase64(enc(bytes.slice(0, 4))); // '안' 뒤 '녕'의 중간에서 자른다
    const b = decodeBase64(enc(bytes.slice(4)));
    expect([...a]).toEqual([...bytes.slice(0, 4)]);
    expect(new TextDecoder().decode(new Uint8Array([...a, ...b]))).toBe("안녕 터미널");
  });
});

describe("터미널: FakeBackend 계약", () => {
  it("열면 세션 번호를 주고 연 위치와 크기를 기억하며, 쓰기·크기 변경이 기록된다", async () => {
    const b = new FakeBackend();
    const id = await b.terminalOpen("/home/a", 80, 24);
    const id2 = await b.terminalOpen("/home/b", 100, 30);
    expect(id2).not.toBe(id);
    expect(b.terminals.get(id)).toEqual({ cwd: "/home/a", cols: 80, rows: 24 });
    await b.terminalWrite(id, "ls\r");
    await b.terminalResize(id, 120, 40);
    expect(b.terminalWrites).toEqual([{ id, data: "ls\r" }]);
    expect(b.terminals.get(id)).toMatchObject({ cols: 120, rows: 40 });
    await b.terminalClose(id);
    expect(b.terminals.has(id)).toBe(false);
    await expect(b.terminalWrite(id, "x")).rejects.toThrow();
  });

  it("출력·종료 이벤트가 구독자에게 오고 해제하면 더는 오지 않는다", async () => {
    const b = new FakeBackend();
    const id = await b.terminalOpen("/home/a", 80, 24);
    const got: TerminalEvent[] = [];
    const off = b.onTerminalEvent((e) => got.push(e));
    b.emitTerminalOutput(id, "hi 안녕");
    const first = got[0];
    expect(first.type === "output" && new TextDecoder().decode(first.data)).toBe("hi 안녕");
    b.emitTerminalExit(id, 3);
    expect(got[1]).toEqual({ type: "exit", id, code: 3 });
    expect(b.terminals.has(id)).toBe(false); // 종료하면 세션도 닫힌다
    off();
    b.emitTerminalOutput(id, "late");
    expect(got).toHaveLength(2);
  });
});
