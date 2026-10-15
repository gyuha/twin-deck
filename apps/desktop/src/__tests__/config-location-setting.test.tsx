import { screen, waitFor, within } from "@testing-library/react";
import { defaultLoaded } from "@twin-deck/ts-client";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

describe("설정 저장 경로 (이슈 #71)", () => {
  const open = async (backend = seedBackend()) => {
    const r = await renderApp(backend);
    await r.user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    const bar = within(await screen.findByRole("group", { name: "설정 저장 경로" }));
    return { ...r, bar };
  };

  it("지정하지 않았으면 기본 위치를 보이고, 기본 위치로 되돌리기 버튼은 없다", async () => {
    const { bar } = await open();
    await waitFor(() => expect(bar.getByTestId("config-location")).toHaveTextContent("기본 위치 (/config)"));
    expect(bar.queryByRole("button", { name: "기본 위치로" })).not.toBeInTheDocument();
  });

  it("빈 폴더를 고르면 묻지 않고 그 경로로 바꾼다", async () => {
    const backend = seedBackend();
    backend.pickFolderResult = "/icloud/TwinDeck";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "경로 바꾸기…" }));
    await waitFor(() => expect(backend.locationChanges).toEqual([{ dir: "/icloud/TwinDeck", conflict: "useExisting" }]));
    expect(screen.queryByRole("dialog", { name: "이 폴더에 이미 설정이 있습니다" })).not.toBeInTheDocument();
    await waitFor(() => expect(bar.getByTestId("config-location")).toHaveTextContent("/icloud/TwinDeck"));
    expect(bar.getByRole("button", { name: "기본 위치로" })).toBeInTheDocument();
  });

  it("폴더 선택을 취소하면 아무것도 바꾸지 않는다", async () => {
    const backend = seedBackend();
    backend.pickFolderResult = null;
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "경로 바꾸기…" }));
    await waitFor(() => expect(bar.getByTestId("config-location")).toHaveTextContent("기본 위치"));
    expect(backend.locationChanges).toEqual([]);
  });

  it("이미 설정이 있는 폴더에서 '그 폴더의 설정 사용'을 고르면 그 설정이 바로 적용된다", async () => {
    const backend = seedBackend();
    const other = defaultLoaded();
    other.config.behavior.table.zebra_rows = true;
    backend.locationConfigs["/icloud/TwinDeck"] = other;
    backend.pickFolderResult = "/icloud/TwinDeck";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "경로 바꾸기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "이 폴더에 이미 설정이 있습니다" }));
    await user.click(ask.getByRole("button", { name: "확인" })); // 기본 선택은 그 폴더의 설정 사용
    await waitFor(() => expect(backend.locationChanges).toEqual([{ dir: "/icloud/TwinDeck", conflict: "useExisting" }]));
    await waitFor(async () => expect((await backend.getConfig()).config.behavior.table.zebra_rows).toBe(true));
  });

  it("'지금 설정으로 덮어쓰기'를 고르면 덮어쓰기로 바꾼다", async () => {
    const backend = seedBackend();
    backend.locationConfigs["/icloud/TwinDeck"] = null;
    backend.pickFolderResult = "/icloud/TwinDeck";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "경로 바꾸기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "이 폴더에 이미 설정이 있습니다" }));
    await user.click(ask.getByRole("radio", { name: /지금 설정으로 덮어쓰기/ }));
    await user.click(ask.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(backend.locationChanges).toEqual([{ dir: "/icloud/TwinDeck", conflict: "overwrite" }]));
  });

  it("묻는 창에서 취소하면 경로를 바꾸지 않는다", async () => {
    const backend = seedBackend();
    backend.locationConfigs["/icloud/TwinDeck"] = null;
    backend.pickFolderResult = "/icloud/TwinDeck";
    const { user, bar } = await open(backend);
    await user.click(bar.getByRole("button", { name: "경로 바꾸기…" }));
    const ask = within(await screen.findByRole("dialog", { name: "이 폴더에 이미 설정이 있습니다" }));
    await user.click(ask.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "이 폴더에 이미 설정이 있습니다" })).not.toBeInTheDocument());
    expect(backend.locationChanges).toEqual([]);
  });

  it("'기본 위치로'를 누르면 기본 위치로 되돌린다", async () => {
    const backend = seedBackend();
    backend.configLocation = { dir: "/icloud/TwinDeck", defaultDir: "/config", custom: true };
    const { user, bar } = await open(backend);
    await user.click(await bar.findByRole("button", { name: "기본 위치로" }));
    await waitFor(() => expect(backend.locationChanges).toEqual([{ dir: null, conflict: "useExisting" }]));
    await waitFor(() => expect(bar.getByTestId("config-location")).toHaveTextContent("기본 위치 (/config)"));
  });
});
