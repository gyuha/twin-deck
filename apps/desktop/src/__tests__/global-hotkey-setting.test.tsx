import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp, seedBackend } from "./helpers";

describe("전역 단축키 설정 (environment.global_hotkey)", () => {
  const openEnv = async (platform: "linux" | "mac" | "windows" = "linux") => {
    const r = await renderApp(undefined, platform);
    await r.user.keyboard(platform === "mac" ? "{Meta>},{/Meta}" : "{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await r.user.click(screen.getByRole("tab", { name: "환경" }));
    const key = await screen.findByRole("combobox", { name: "전역 화면 열기 단축키" });
    return { ...r, key, hotkey: async () => (await r.backend.getConfig()).config.environment.global_hotkey };
  };

  it("macOS에서는 기본값 Mod+Alt+O가 Cmd·Ctrl·Alt·Shift 체크와 선택 상자로 보인다", async () => {
    const { key } = await openEnv("mac");
    expect(key).toHaveValue("O");
    expect(screen.getByRole("checkbox", { name: "Cmd" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ctrl" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Shift" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Mod" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "전역 화면 열기 단축키 사용" })).toBeChecked();
  });

  it("Windows·Linux에서는 Mod가 Ctrl과 같은 키라 Ctrl·Alt·Shift만 보이고 기본값은 Ctrl이 체크된다", async () => {
    const { key } = await openEnv("windows");
    expect(key).toHaveValue("O");
    expect(screen.getByRole("checkbox", { name: "Ctrl" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Shift" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Mod" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Cmd" })).not.toBeInTheDocument();
  });

  it("체크와 키를 고르면 Mod, Ctrl, Alt, Shift 순서의 문자열로 바로 저장한다", async () => {
    const { user, key, hotkey } = await openEnv("mac");
    await user.click(screen.getByRole("checkbox", { name: "Alt" })); // Mod+O
    await waitFor(async () => expect(await hotkey()).toBe("Mod+O"));
    await user.click(screen.getByRole("checkbox", { name: "Shift" })); // Mod+Shift+O
    await user.selectOptions(key, "K");
    await waitFor(async () => expect(await hotkey()).toBe("Mod+Shift+K"));
  });

  it("글자·숫자는 수식키 없이는 저장하지 않고 안내하며, F키는 수식키 없이도 저장한다", async () => {
    const { user, key, hotkey } = await openEnv("mac");
    await user.click(screen.getByRole("checkbox", { name: "Cmd" }));
    await user.click(screen.getByRole("checkbox", { name: "Alt" })); // 수식키 없음 + O
    expect(await screen.findByText("글자·숫자 키는 수식키를 하나 이상 골라야 합니다")).toBeInTheDocument();
    expect(await hotkey()).toBe("Alt+O"); // 마지막으로 저장된 값 그대로
    await user.selectOptions(key, "F5");
    await waitFor(async () => expect(await hotkey()).toBe("F5"));
    expect(screen.queryByText("글자·숫자 키는 수식키를 하나 이상 골라야 합니다")).not.toBeInTheDocument();
  });

  it("(없음)을 고르면 빈 문자열로 저장하고, 이어서 키를 고르면 다시 저장한다", async () => {
    const { user, key, hotkey } = await openEnv("mac");
    await user.selectOptions(key, "");
    await waitFor(async () => expect(await hotkey()).toBe(""));
    await user.selectOptions(key, "F1");
    await waitFor(async () => expect(await hotkey()).toBe("Mod+Alt+F1")); // 체크는 그대로 남아 있다
  });

  it("목록에 없는 값은 그대로 두고 현재 값을 보여 준다", async () => {
    const b = seedBackend();
    await b.setConfigValue("environment.global_hotkey", { kind: "str", value: "Mod+Alt+Space" });
    const { user } = await renderApp(b);
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "환경" }));
    const key = await screen.findByRole("combobox", { name: "전역 화면 열기 단축키" });
    expect(key).toHaveValue("");
    expect(screen.getByText("현재 값: Mod+Alt+Space (목록에 없음)")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Shift" })); // 키를 고르기 전에는 저장하지 않는다
    expect((await b.getConfig()).config.environment.global_hotkey).toBe("Mod+Alt+Space");
  });

  it("사용 스위치를 끄면 체크와 선택 상자가 비활성화되고, 켜면 다시 쓸 수 있다", async () => {
    const { user, key } = await openEnv("mac");
    const sw = screen.getByRole("switch", { name: "전역 화면 열기 단축키 사용" });
    const boxes = ["Cmd", "Ctrl", "Alt", "Shift"].map((n) => screen.getByRole("checkbox", { name: n }));
    expect(key).toBeEnabled();
    await user.click(sw);
    await waitFor(() => expect(key).toBeDisabled());
    boxes.forEach((c) => expect(c).toBeDisabled());
    await user.click(sw);
    await waitFor(() => expect(key).toBeEnabled());
    boxes.forEach((c) => expect(c).toBeEnabled());
  });

  it("앱을 하나만 실행 스위치가 환경 탭에 있고 기본으로 켜져 있다 (environment.single_instance)", async () => {
    const { user } = await renderApp();
    await user.keyboard("{Control>},{/Control}");
    await screen.findByRole("dialog", { name: "설정" });
    await user.click(screen.getByRole("tab", { name: "환경" }));
    expect(await screen.findByRole("switch", { name: "앱을 하나만 실행" })).toBeChecked();
  });
});
