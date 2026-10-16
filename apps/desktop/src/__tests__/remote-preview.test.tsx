import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, seedBackend } from "./helpers";

// 원격(SFTP) 패널에서 미리보기: 텍스트·이미지만 보이고 나머지 형식은 "미리 볼 수 없는 형식"이다. 텍스트 편집은 막는다.
const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" };
const ROOT = "sftp://kim@nas:22";
// 이름순(전부 파일): clip.mp4(0), doc.docx(1), note.txt(2), paper.pdf(3), pic.png(4), song.mp3(5)
const files = {
  [`${ROOT}/clip.mp4`]: "video\u0000",
  [`${ROOT}/doc.docx`]: "PK\u0003\u0004\u0000",
  [`${ROOT}/note.txt`]: "원격 본문 글",
  [`${ROOT}/paper.pdf`]: "%PDF-1.4",
  [`${ROOT}/pic.png`]: "PNGDATA",
  [`${ROOT}/song.mp3`]: "audio\u0000",
};

async function connected() {
  const backend = seedBackend();
  backend.setConfig((l) => (l.config.remote = { servers: [SFTP] }));
  backend.seed(files);
  backend.remotePasswords.set("kim@nas:22/sftp", "pw");
  const app = await renderApp(backend);
  await app.user.click(within(screen.getByRole("toolbar", { name: "드라이브 (오른쪽 패널)" })).getByRole("button", { name: "연결" }));
  await app.user.click(within(screen.getByRole("dialog", { name: "서버에 연결" })).getByRole("option", { name: /SFTP · 회사/ }));
  await waitFor(() => expect(within(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).getAllByRole("option")).toHaveLength(6));
  return app;
}
/** 오른쪽(원격) 패널의 `n`번째 파일에서 ArrowRight로 미리보기를 연다. */
async function preview(user: Awaited<ReturnType<typeof connected>>["user"], n: number, name: string) {
  await user.click(within(screen.getByRole("listbox", { name: "오른쪽 파일 목록" })).getAllByRole("option")[n]);
  await user.keyboard("{ArrowRight}");
  return within(await screen.findByRole("dialog", { name: `미리보기: ${name}` }));
}

afterEach(() => vi.unstubAllGlobals());

describe("원격 파일 미리보기 (SFTP·FTP)", () => {
  it("텍스트 파일은 본문이 보인다", async () => {
    const { user } = await connected();
    const d = await preview(user, 2, "note.txt");
    expect(await d.findByText("원격 본문 글")).toBeInTheDocument();
  });

  it("이미지는 그림으로 보이고 이미지 복사 버튼이 동작한다", async () => {
    const { user, backend } = await connected();
    const d = await preview(user, 4, "pic.png");
    const img = await d.findByRole("img");
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await user.click(d.getByRole("button", { name: "이미지 복사" }));
    await waitFor(() => expect(backend.copiedImages).toEqual([`${ROOT}/pic.png`]));
  });

  it("Office·PDF·동영상·오디오는 미리 볼 수 없는 형식이고 파일 주소를 열거나 읽지 않는다", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const { user, backend } = await connected();
    const fileUrl = vi.spyOn(backend, "fileUrl");
    for (const [n, name] of [[0, "clip.mp4"], [1, "doc.docx"], [3, "paper.pdf"], [5, "song.mp3"]] as const) {
      const d = await preview(user, n, name);
      expect(await d.findByText(/미리 볼 수 없는 형식입니다/)).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: `미리보기: ${name}` })).toBeNull());
    }
    expect(backend.officeCalls).toEqual([]); // docx를 Office 뷰로 읽지 않는다
    expect(fileUrl).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
  });

  it("원격 텍스트는 보기 전용이다: 더블클릭해도 편집 상자가 열리지 않고 이유가 보인다", async () => {
    const { user } = await connected();
    const d = await preview(user, 2, "note.txt");
    await user.dblClick(await d.findByText("원격 본문 글"));
    expect(await screen.findByText("원격 파일은 미리보기에서 편집할 수 없습니다")).toBeInTheDocument();
    expect(d.queryByRole("textbox", { name: "텍스트 편집" })).toBeNull();
  });
});
