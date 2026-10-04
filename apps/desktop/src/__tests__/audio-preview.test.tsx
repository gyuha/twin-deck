import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이름순: a.mp3, b.wav, c.ogg, notes.txt
const seed = () =>
  new FakeBackend().seed({
    "/home/a/a.mp3": "ID3-fake-mp3",
    "/home/a/b.wav": "RIFF-fake-wav",
    "/home/a/c.ogg": "OggS-fake",
    "/home/a/notes.txt": "hi",
    "/home/b": null,
  });
const blobText = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
const dlg = (name: string) => screen.findByRole("dialog", { name });
const open = async (user: Awaited<ReturnType<typeof renderApp>>["user"], downs: number) => {
  await user.keyboard("{ArrowDown}".repeat(downs) + "{ArrowRight}");
};

describe("사운드 파일 미리보기", () => {
  const created: Blob[] = [];
  const revoked: string[] = [];
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return `blob:audio-${created.length}`;
    });
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
    // jsdom에는 재생이 없다. 재생이 시작되면 알 수 있게 가로챈다.
    play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play = play as unknown as () => Promise<void>;
    pause = vi.fn();
    HTMLMediaElement.prototype.pause = pause as unknown as () => void;
    HTMLMediaElement.prototype.load = vi.fn() as unknown as () => void;
  });
  afterEach(() => vi.restoreAllMocks());

  it("열면 자동 재생 없이 재생 UI(controls)만 뜬다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0); // a.mp3
    const d = within(await dlg("미리보기: a.mp3"));
    const audio = (await d.findByLabelText("오디오 미리보기: a.mp3")) as HTMLAudioElement;
    expect(audio.tagName).toBe("AUDIO");
    expect(audio.controls).toBe(true);
    expect(audio.autoplay).toBe(false);
    expect(audio.hasAttribute("autoplay")).toBe(false);
    expect(audio.getAttribute("preload")).toBe("metadata");
    expect(play).not.toHaveBeenCalled(); // 바로 재생되지 않는다
  });

  it("재생기의 src는 Blob URL이고 데이터는 원본이며, 닫으면 URL을 해제한다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    const audio = await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3");
    expect(audio.getAttribute("src")).toBe("blob:audio-1");
    expect(created[0].type).toBe("audio/mpeg");
    expect(await blobText(created[0])).toBe("ID3-fake-mp3"); // jsdom의 Blob에는 text()가 없어 FileReader로 읽는다
    await user.keyboard("{Escape}");
    await waitFor(() => expect(revoked).toEqual(["blob:audio-1"]));
    expect(play).not.toHaveBeenCalled();
  });

  it("파일 이름이 제목으로 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 1); // b.wav
    const d = within(await dlg("미리보기: b.wav"));
    expect(d.getByRole("heading", { name: "b.wav" })).toBeInTheDocument();
    expect(created[0]?.type ?? "audio/wav").toBe("audio/wav");
  });

  it("너무 커서 데이터가 없으면 재생기 대신 크기가 든 안내가 보인다", async () => {
    const b = seed();
    const orig = b.preview.bind(b);
    b.preview = async (path: string) => (path.endsWith("a.mp3") ? { kind: "audio", text: null, truncated: true, size: 25 * 1024 * 1024, dataUrl: null } : orig(path));
    const { user } = await renderApp(b);
    await open(user, 0);
    const d = within(await dlg("미리보기: a.mp3"));
    expect(await d.findByText(/너무 커서 미리 들을 수 없습니다/)).toHaveTextContent("25");
    expect(d.queryByLabelText(/오디오 미리보기/)).toBeNull();
  });

  it("웹뷰가 못 푸는 형식(error 이벤트)이면 재생할 수 없다는 안내가 보인다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 2); // c.ogg
    const d = within(await dlg("미리보기: c.ogg"));
    const audio = await d.findByLabelText("오디오 미리보기: c.ogg");
    fireEvent.error(audio);
    expect(await d.findByText(/재생할 수 없습니다/)).toHaveTextContent("c.ogg");
    expect(d.queryByLabelText(/오디오 미리보기/)).toBeNull();
  });

  it("다음 항목으로 넘기면 이전 재생기가 사라지고 새 파일의 것이 보이며 이전 URL이 해제된다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0); // a.mp3
    await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3");
    await user.keyboard("{ArrowDown}"); // 미리보기 안에서 다음 항목: b.wav
    const d = within(await dlg("미리보기: b.wav"));
    await d.findByLabelText("오디오 미리보기: b.wav");
    expect(screen.queryByLabelText("오디오 미리보기: a.mp3")).toBeNull();
    expect(revoked).toContain("blob:audio-1");
    expect(play).not.toHaveBeenCalled();
  });

  it("닫거나 다른 파일로 넘어가면 재생을 멈춘다(pause)", async () => {
    const { user } = await renderApp(seed());
    await open(user, 0);
    await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3");
    expect(pause).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}"); // b.wav로 넘어감
    await within(await dlg("미리보기: b.wav")).findByLabelText("오디오 미리보기: b.wav");
    expect(pause).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(2));
  });

  it("텍스트 같은 다른 파일은 재생기를 쓰지 않는다", async () => {
    const { user } = await renderApp(seed());
    await open(user, 3); // notes.txt
    const d = within(await dlg("미리보기: notes.txt"));
    expect(d.queryByLabelText(/오디오 미리보기/)).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
