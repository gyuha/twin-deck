import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp } from "./helpers";

// 이름순: a.mp3, b.mp4, notes.txt
const seed = (autoplay: { audio?: boolean; video?: boolean } = {}) => {
  const b = new FakeBackend().seed({ "/home/a/a.mp3": "ID3-fake", "/home/a/b.mp4": "fake-mp4", "/home/a/notes.txt": "hi", "/home/b": null });
  b.setConfig((l) => {
    l.config.preview.audio_autoplay = autoplay.audio ?? false;
    l.config.preview.video_autoplay = autoplay.video ?? false;
  });
  return b;
};
type User = Awaited<ReturnType<typeof renderApp>>["user"];
const dlg = (name: string) => screen.findByRole("dialog", { name });
const openAt = (user: User, downs: number) => user.keyboard("{ArrowDown}".repeat(downs) + "{ArrowRight}");

describe("비디오 미리보기", () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    HTMLMediaElement.prototype.play = play as unknown as () => Promise<void>;
    HTMLMediaElement.prototype.pause = pause as unknown as () => void;
    HTMLMediaElement.prototype.load = vi.fn() as unknown as () => void;
  });
  afterEach(() => vi.restoreAllMocks());

  it("열면 자동 재생 없이 재생 UI(controls)만 뜨고, 파일 주소는 앱이 준 주소다", async () => {
    const { user } = await renderApp(seed());
    await openAt(user, 1);
    const d = within(await dlg("미리보기: b.mp4"));
    const video = (await d.findByLabelText("비디오 미리보기: b.mp4")) as HTMLVideoElement;
    expect(video.tagName).toBe("VIDEO");
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("src")).toBe("fake-asset://localhost/home/a/b.mp4#t=0.001");
    expect(play).not.toHaveBeenCalled();
  });

  it("비디오 자동 재생 옵션을 켜면 autoplay로 열린다 (사운드 옵션과는 따로다)", async () => {
    const { user } = await renderApp(seed({ video: true }));
    await openAt(user, 1);
    const video = (await within(await dlg("미리보기: b.mp4")).findByLabelText("비디오 미리보기: b.mp4")) as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
  });

  it("사운드 자동 재생 옵션을 켜면 사운드만 autoplay로 열린다", async () => {
    const { user } = await renderApp(seed({ audio: true }));
    await user.keyboard("{ArrowRight}"); // a.mp3
    const audio = (await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3")) as HTMLAudioElement;
    expect(audio.autoplay).toBe(true);
    await user.keyboard("{ArrowDown}"); // 미리보기 안에서 b.mp4로
    const video = (await within(await dlg("미리보기: b.mp4")).findByLabelText("비디오 미리보기: b.mp4")) as HTMLVideoElement;
    expect(video.autoplay).toBe(false);
  });

  it("옵션이 켜져 있으면 재생 가능해질 때(canplay) 재생을 시작하고, 꺼져 있으면 시작하지 않는다", async () => {
    const { user } = await renderApp(seed({ video: true }));
    await openAt(user, 1);
    const video = await within(await dlg("미리보기: b.mp4")).findByLabelText("비디오 미리보기: b.mp4");
    expect(play).not.toHaveBeenCalled();
    fireEvent.canPlay(video);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("옵션이 꺼져 있으면 canplay가 와도 재생하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await openAt(user, 1);
    const video = await within(await dlg("미리보기: b.mp4")).findByLabelText("비디오 미리보기: b.mp4");
    fireEvent.canPlay(video);
    expect(play).not.toHaveBeenCalled();
  });

  it("기본은 둘 다 자동 재생하지 않는다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{ArrowRight}");
    const audio = (await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3")) as HTMLAudioElement;
    expect(audio.autoplay).toBe(false);
  });

  it("웹뷰가 못 푸는 형식(error 이벤트)이면 재생할 수 없다는 안내가 보인다", async () => {
    const { user } = await renderApp(seed());
    await openAt(user, 1);
    const d = within(await dlg("미리보기: b.mp4"));
    fireEvent.error(await d.findByLabelText("비디오 미리보기: b.mp4"));
    expect(await d.findByText(/재생할 수 없습니다/)).toHaveTextContent("b.mp4");
  });

  it("닫거나 다른 파일로 넘어가면 재생을 멈춘다(pause)", async () => {
    const { user } = await renderApp(seed());
    await openAt(user, 1);
    await within(await dlg("미리보기: b.mp4")).findByLabelText("비디오 미리보기: b.mp4");
    const video = screen.getByLabelText("비디오 미리보기: b.mp4");
    expect(video.getAttribute("src")).toBe("fake-asset://localhost/home/a/b.mp4#t=0.001"); // 개발 모드의 가짜 정리가 src를 지우지 않는다
    pause.mockClear();
    await user.keyboard("{ArrowDown}"); // notes.txt
    await within(await dlg("미리보기: notes.txt")).findByLabelText("텍스트 미리보기");
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });
});

describe("설정 화면의 미리보기 탭", () => {
  it("사운드·비디오 자동 재생 스위치가 있고 바꾸면 저장되며 서로 영향이 없다", async () => {
    const { user, backend } = await renderApp(seed());
    await user.keyboard("{Control>},{/Control}");
    await dlg("설정");
    await user.click(screen.getByRole("tab", { name: "미리보기" }));
    const audio = screen.getByRole("switch", { name: "사운드 자동 재생" });
    const video = screen.getByRole("switch", { name: "비디오 자동 재생" });
    expect(audio).not.toBeChecked();
    expect(video).not.toBeChecked();
    await user.click(audio);
    await waitFor(async () => expect((await backend.getConfig()).config.preview.audio_autoplay).toBe(true));
    expect((await backend.getConfig()).config.preview.video_autoplay).toBe(false);
    await user.click(video);
    await waitFor(async () => expect((await backend.getConfig()).config.preview.video_autoplay).toBe(true));
    expect((await backend.getConfig()).config.preview.audio_autoplay).toBe(true);
  });

  it("설정을 켠 뒤 미리보기를 열면 바로 반영된다", async () => {
    const { user } = await renderApp(seed());
    await user.keyboard("{Control>},{/Control}");
    await dlg("설정");
    await user.click(screen.getByRole("tab", { name: "미리보기" }));
    await user.click(screen.getByRole("switch", { name: "사운드 자동 재생" }));
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowRight}");
    const audio = (await within(await dlg("미리보기: a.mp3")).findByLabelText("오디오 미리보기: a.mp3")) as HTMLAudioElement;
    await waitFor(() => expect(audio.autoplay).toBe(true));
  });
});
