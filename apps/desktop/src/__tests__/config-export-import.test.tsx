import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

describe("설정 내보내기·가져오기 (이슈 #71)", () => {
  const open = async (backend = seedBackend()) => {
    const r = await renderApp(backend);
    await r.user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await r.user.click(screen.getByRole("tab", { name: "환경" }));
    const bar = within(await screen.findByRole("group", { name: "설정 저장 경로" }));
    return { ...r, bar };
  };

  it("내보내기는 저장 위치를 twin-deck-settings.zip 이름으로 묻고 고른 경로에 내보낸다", async () => {
    const backend = seedBackend();
    backend.pickSaveFileResult = "/home/a/twin-deck-settings.zip";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "내보내기…" }));
    await waitFor(() => expect([...backend.exportedConfigs.keys()]).toEqual(["/home/a/twin-deck-settings.zip"]));
    expect(backend.lastSaveFileName).toBe("twin-deck-settings.zip");
    expect(await screen.findByText("설정을 내보냈습니다: /home/a/twin-deck-settings.zip")).toBeInTheDocument();
  });

  it("내보내기 저장 위치를 취소하면 아무것도 내보내지 않는다", async () => {
    const backend = seedBackend();
    backend.pickSaveFileResult = null;
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "내보내기…" }));
    await waitFor(() => expect(backend.lastSaveFileName).toBe("twin-deck-settings.zip"));
    expect(backend.exportedConfigs.size).toBe(0);
  });

  it("가져오기는 확인을 받은 뒤 그 파일의 설정을 바로 적용한다", async () => {
    const backend = seedBackend();
    const exported = await backend.getConfig();
    exported.config.behavior.table.zebra_rows = true;
    backend.exportedConfigs.set("/home/a/s.zip", exported);
    backend.pickFileResult = "/home/a/s.zip";
    const { user, bar } = await open(backend);
    expect((await backend.getConfig()).config.behavior.table.zebra_rows).toBe(false);
    await user.click(bar.getByRole("button", { name: "가져오기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "설정 가져오기" }));
    expect(ask.getByText("/home/a/s.zip")).toBeInTheDocument();
    await user.click(ask.getByRole("button", { name: "가져오기" }));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.zebra_rows).toBe(true));
    expect(await screen.findByText("설정을 가져왔습니다")).toBeInTheDocument();
  });

  it("가져오기 확인에서 취소하면 설정을 바꾸지 않는다", async () => {
    const backend = seedBackend();
    const exported = await backend.getConfig();
    exported.config.behavior.table.zebra_rows = true;
    backend.exportedConfigs.set("/home/a/s.zip", exported);
    backend.pickFileResult = "/home/a/s.zip";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "가져오기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "설정 가져오기" }));
    await user.click(ask.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "설정 가져오기" })).not.toBeInTheDocument());
    expect((await backend.getConfig()).config.behavior.table.zebra_rows).toBe(false);
  });

  it("가져오기가 거부되면 설정 화면에 이유를 보이고 설정은 그대로다", async () => {
    const backend = seedBackend();
    backend.pickFileResult = "/home/a/broken.zip";
    backend.importError = "config.toml에 문법 오류가 있어 가져오지 않았습니다";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "가져오기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "설정 가져오기" }));
    await user.click(ask.getByRole("button", { name: "가져오기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("config.toml에 문법 오류가 있어 가져오지 않았습니다");
    expect((await backend.getConfig()).config.behavior.table.zebra_rows).toBe(false);
  });
});
