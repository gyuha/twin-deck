import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { detectEol, editBlockReason, toDisk, toEditor } from "../lib/previewEdit";
import { renderApp } from "./helpers";

// 목록은 이름순이다. 첫 파일에서 ArrowRight로 미리보기를 연다(폴더 /home/b는 오른쪽 패널).
async function open(files: Record<string, string>, name: string, configure?: (b: FakeBackend) => void) {
  const backend = new FakeBackend().seed({ ...files, "/home/b": null });
  configure?.(backend);
  const { user } = await renderApp(backend);
  await user.keyboard("{ArrowRight}");
  const el = await screen.findByRole("dialog", { name: `미리보기: ${name}` });
  return { user, backend, dlg: within(el), el };
}
const SAVE = "{Control>}s{/Control}"; // renderApp의 기본 플랫폼은 linux라 Mod는 Ctrl
const editBox = (d: ReturnType<typeof within>) => d.queryByRole("textbox", { name: "텍스트 편집" }) as HTMLTextAreaElement | null;
const startEdit = async (user: Awaited<ReturnType<typeof open>>["user"], d: ReturnType<typeof within>, text: string | RegExp) => {
  await user.dblClick(await d.findByText(text));
  return (await d.findByRole("textbox", { name: "텍스트 편집" })) as HTMLTextAreaElement;
};

describe("편집 규칙(순수 함수)", () => {
  it("줄바꿈 판별: LF만·CRLF만·섞임", () => {
    expect(detectEol("a\nb\n")).toBe("lf");
    expect(detectEol("한 줄")).toBe("lf");
    expect(detectEol("a\r\nb\r\n")).toBe("crlf");
    expect(detectEol("a\r\nb\nc")).toBe("mixed");
    expect(detectEol("a\rb")).toBe("mixed");
  });
  it("편집 상자용으로 CRLF를 LF로, 저장용으로 되돌린다(마지막 줄 끝 줄바꿈 유무 유지)", () => {
    expect(toEditor("a\r\nb\r\n")).toBe("a\nb\n");
    expect(toDisk("a\nb\n", "crlf")).toBe("a\r\nb\r\n");
    expect(toDisk("a\nb", "crlf")).toBe("a\r\nb");
    expect(toDisk("a\nb\n", "lf")).toBe("a\nb\n");
  });
  it("편집할 수 없는 이유: 압축 안 경로·잘림·섞인 줄바꿈·텍스트가 아님", () => {
    const ok = { path: "/home/a/a.txt", kind: "text", truncated: false, text: "x" };
    expect(editBlockReason(ok)).toBeNull();
    expect(editBlockReason({ ...ok, path: "/home/a/x.zip!/a.txt" })).toContain("압축");
    expect(editBlockReason({ ...ok, truncated: true })).toContain("일부만");
    expect(editBlockReason({ ...ok, text: "a\r\nb\nc" })).toContain("줄바꿈");
    expect(editBlockReason({ ...ok, kind: "other" })).not.toBeNull();
    expect(editBlockReason({ ...ok, text: null })).not.toBeNull();
  });
});

describe("미리보기에서 더블클릭으로 편집", () => {
  it("편집할 수 있는 텍스트 파일은 더블클릭하면 원문 편집 상자가 뜬다", async () => {
    const { user, dlg } = await open({ "/home/a/a.txt": "첫 줄\n둘째 줄\n" }, "a.txt");
    expect(editBox(dlg)).toBeNull();
    const box = await startEdit(user, dlg, /첫 줄/);
    expect(box.value).toBe("첫 줄\n둘째 줄\n");
    expect(dlg.getByText(/편집 중/)).toBeInTheDocument();
  });

  it("마크다운도 렌더링된 글자가 아니라 원문이 편집 상자에 나온다", async () => {
    const md = "# 제목\n\n- **굵게**\n";
    const { user, dlg } = await open({ "/home/a/r.md": md }, "r.md");
    const box = await startEdit(user, dlg, "제목");
    expect(box.value).toBe(md);
  });

  it("64KB를 넘어 일부만 보이는 파일은 편집을 시작하지 않고 이유를 알린다", async () => {
    const { user, dlg } = await open({ "/home/a/big.txt": "가".repeat(70 * 1024) }, "big.txt");
    await user.dblClick(dlg.getByLabelText("텍스트 미리보기"));
    expect(editBox(dlg)).toBeNull();
    expect(await screen.findByText(/일부만 보여 편집할 수 없습니다/)).toBeInTheDocument();
  });

  it("줄바꿈이 섞인 파일은 편집을 시작하지 않고 이유를 알린다", async () => {
    const { user, dlg } = await open({ "/home/a/m.txt": "a\r\nb\nc" }, "m.txt");
    await user.dblClick(dlg.getByLabelText("텍스트 미리보기"));
    expect(editBox(dlg)).toBeNull();
    expect(await screen.findByText(/줄바꿈이 섞여 있어 편집할 수 없습니다/)).toBeInTheDocument();
  });
});

describe("Mod+S 저장", () => {
  it("저장하면 바뀐 글자가 한 번 쓰이고 편집 상태가 유지되며 변경 표시가 사라진다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "하나\n" }, "a.txt");
    const box = await startEdit(user, dlg, /하나/);
    await user.type(box, "둘");
    expect(dlg.getByText(/●/)).toBeInTheDocument();
    await user.keyboard(SAVE);
    await waitFor(() => expect(backend.writes).toEqual([{ path: "/home/a/a.txt", text: "하나\n둘" }]));
    expect(editBox(dlg)).not.toBeNull();
    await waitFor(() => expect(dlg.queryByText(/●/)).toBeNull());
  });

  it("CRLF 파일은 저장할 때 줄바꿈을 CRLF로 되돌려 쓴다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/w.txt": "a\r\nb\r\n" }, "w.txt");
    await user.dblClick(dlg.getByLabelText("텍스트 미리보기"));
    const box = (await dlg.findByRole("textbox", { name: "텍스트 편집" })) as HTMLTextAreaElement;
    expect(box.value).toBe("a\nb\n");
    await user.type(box, "c");
    await user.keyboard(SAVE);
    await waitFor(() => expect(backend.writes[0]?.text).toBe("a\r\nb\r\nc"));
  });

  it("연속 저장이 서로 충돌하지 않는다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    const box = await startEdit(user, dlg, "x");
    await user.type(box, "1");
    await user.keyboard(SAVE);
    await waitFor(() => expect(backend.writes).toHaveLength(1));
    await user.type(box, "2");
    await user.keyboard(SAVE);
    await waitFor(() => expect(backend.writes.map((w) => w.text)).toEqual(["x1", "x12"]));
    expect(screen.queryByRole("dialog", { name: "파일이 밖에서 바뀌었습니다" })).toBeNull();
  });

  it("편집 중이 아니면 Mod+S는 아무것도 쓰지 않는다", async () => {
    const { user, backend } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    await user.keyboard(SAVE);
    expect(backend.writes).toHaveLength(0);
  });
});

describe("편집 상자 안의 키", () => {
  it("Space·방향키·Enter·Delete가 미리보기 동작(이웃 이동·삭제·닫기·열기)을 일으키지 않는다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "abc", "/home/a/b.txt": "next" }, "a.txt");
    const box = await startEdit(user, dlg, "abc");
    await user.type(box, " {ArrowLeft}{ArrowDown}{Delete}{Enter}z");
    expect(screen.getByRole("dialog", { name: "미리보기: a.txt" })).toBeInTheDocument();
    expect(box.value).toContain("z");
    expect(backend.writes).toHaveLength(0);
    expect(await backend.fileInfo("/home/a/b.txt")).toBeTruthy(); // 삭제 확인 대화상자도 뜨지 않았다
    expect(screen.queryByRole("dialog", { name: /삭제/ })).toBeNull();
  });
});

describe("저장 안 한 변경 보호", () => {
  it("변경이 없을 때 Esc는 편집만 끝내고 미리보기는 열려 있다", async () => {
    const { user, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    const box = await startEdit(user, dlg, "x");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(editBox(dlg)).toBeNull());
    expect(screen.getByRole("dialog", { name: "미리보기: a.txt" })).toBeInTheDocument();
  });

  it("변경이 있을 때 Esc는 '저장 / 버리기 / 취소' 대화상자를 띄운다 — 저장", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    const box = await startEdit(user, dlg, "x");
    await user.type(box, "y");
    fireEvent.keyDown(box, { key: "Escape" });
    const ask = within(await screen.findByRole("dialog", { name: "저장하지 않은 변경" }));
    await user.click(ask.getByRole("button", { name: "확인" })); // 기본 선택은 저장
    await waitFor(() => expect(backend.writes.map((w) => w.text)).toEqual(["xy"]));
    await waitFor(() => expect(editBox(dlg)).toBeNull());
  });

  it("버리기를 고르면 쓰지 않고 편집을 끝낸다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    const box = await startEdit(user, dlg, "x");
    await user.type(box, "y");
    fireEvent.keyDown(box, { key: "Escape" });
    const ask = within(await screen.findByRole("dialog", { name: "저장하지 않은 변경" }));
    await user.click(ask.getByRole("radio", { name: /버리기/ }));
    await user.click(ask.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(editBox(dlg)).toBeNull());
    expect(backend.writes).toHaveLength(0);
    expect(dlg.getByText("x")).toBeInTheDocument(); // 원래 내용 그대로
  });

  it("취소를 고르면 편집 상태와 입력한 글자를 그대로 둔다", async () => {
    const { user, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt");
    const box = await startEdit(user, dlg, "x");
    await user.type(box, "y");
    fireEvent.keyDown(box, { key: "Escape" });
    const ask = within(await screen.findByRole("dialog", { name: "저장하지 않은 변경" }));
    await user.click(ask.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "저장하지 않은 변경" })).toBeNull());
    expect(editBox(dlg)!.value).toBe("xy");
  });

  it("변경이 있을 때 ✕와 바깥 클릭으로 닫으려 해도 같은 대화상자가 뜨고 닫히지 않는다", async () => {
    const { user, el, dlg } = await open({ "/home/a/a.txt": "x" }, "a.txt", (b) => b.setConfig((l) => (l.config.preview.close_on_outside_click = true)));
    const box = await startEdit(user, dlg, "x");
    await user.type(box, "y");
    await user.click(dlg.getByRole("button", { name: "닫기" }));
    const ask = within(await screen.findByRole("dialog", { name: "저장하지 않은 변경" }));
    await user.click(ask.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("dialog", { name: "미리보기: a.txt" })).toBeInTheDocument();
    fireEvent.mouseDown(el.parentElement!, { button: 0 }); // 바깥(어두운 배경) 클릭
    expect(await screen.findByRole("dialog", { name: "저장하지 않은 변경" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "미리보기: a.txt" })).toBeInTheDocument();
  });
});

describe("밖에서 바뀐 파일 보호", () => {
  it("저장 시점에 파일이 바뀌어 있으면 쓰지 않고 '덮어쓰기 / 취소'를 묻는다 — 취소", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "원래" }, "a.txt");
    const box = await startEdit(user, dlg, "원래");
    backend.externalWrite("/home/a/a.txt", "밖에서 바꾼 내용");
    await user.type(box, "추가");
    await user.keyboard(SAVE);
    const ask = within(await screen.findByRole("dialog", { name: "파일이 밖에서 바뀌었습니다" }));
    expect(backend.writes).toHaveLength(0);
    await user.click(ask.getByRole("button", { name: "취소" }));
    expect(backend.writes).toHaveLength(0);
    expect(editBox(dlg)!.value).toBe("원래추가");
  });

  it("덮어쓰기를 고르면 비교 없이 쓴다", async () => {
    const { user, backend, dlg } = await open({ "/home/a/a.txt": "원래" }, "a.txt");
    const box = await startEdit(user, dlg, "원래");
    backend.externalWrite("/home/a/a.txt", "밖에서 바꾼 내용");
    await user.type(box, "추가");
    await user.keyboard(SAVE);
    const ask = within(await screen.findByRole("dialog", { name: "파일이 밖에서 바뀌었습니다" }));
    await user.click(ask.getByRole("button", { name: "덮어쓰기" }));
    await waitFor(() => expect(backend.writes.map((w) => w.text)).toEqual(["원래추가"]));
  });
});
