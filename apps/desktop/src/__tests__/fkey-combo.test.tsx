import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

type User = Awaited<ReturnType<typeof renderApp>>["user"];

const openFKeys = async (user: User) => {
  await user.keyboard("{Control>},{/Control}");
  await user.click(await screen.findByRole("tab", { name: "F키" }));
};
const adder = () => screen.getByRole("group", { name: "조합키 추가" });
const addCombo = async (user: User, f: string, mods: string[]) => {
  await user.selectOptions(within(adder()).getByLabelText("F키"), f);
  for (const m of mods) await user.click(within(adder()).getByRole("checkbox", { name: m }));
  await user.click(within(adder()).getByRole("button", { name: "추가" }));
};
const fkeysOf = async (b: FakeBackend) => (await b.getConfig()).config.fkeys;

describe("F키 설정의 조합키 항목", () => {
  it("F키와 수식키를 골라 추가하면 fkeys에 조합 항목이 저장되고 줄로 보인다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openFKeys(user);
    await addCombo(user, "F5", ["Ctrl", "Shift"]);
    await waitFor(async () => expect(await fkeysOf(backend)).toHaveProperty("Ctrl+Shift+F5", ""));
    expect(await screen.findByRole("group", { name: "Ctrl+Shift+F5" })).toBeInTheDocument();
    expect((await fkeysOf(backend)).F5).toBe(""); // 단독 F5는 그대로
  });

  it("같은 F키에 서로 다른 조합을 둘 만들 수 있고, 이미 있는 조합은 막는다", async () => {
    const backend = seedBackend();
    const { user } = await renderApp(backend);
    await openFKeys(user);
    await addCombo(user, "F5", ["Ctrl"]);
    await waitFor(async () => expect(await fkeysOf(backend)).toHaveProperty("Ctrl+F5"));
    await user.click(within(adder()).getByRole("checkbox", { name: "Alt" }));
    await user.click(within(adder()).getByRole("button", { name: "추가" }));
    await waitFor(async () => expect(await fkeysOf(backend)).toHaveProperty("Ctrl+Alt+F5"));
    // Alt를 다시 끄면 이미 있는 Ctrl+F5라서 추가가 막힌다
    await user.click(within(adder()).getByRole("checkbox", { name: "Alt" }));
    expect(within(adder()).getByRole("button", { name: "추가" })).toBeDisabled();
    expect(within(adder()).getByText("이미 있는 조합입니다")).toBeInTheDocument();
  });

  it("수식키 없이는 추가할 수 없다", async () => {
    const { user } = await renderApp(seedBackend());
    await openFKeys(user);
    expect(within(adder()).getByRole("button", { name: "추가" })).toBeDisabled();
  });

  it("삭제하면 조합 항목과 그 앱 경로가 함께 사라진다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => {
      l.config.fkeys["Ctrl+F5"] = "core.app.launch";
      l.config.fkey_apps["Ctrl+F5"] = "/Applications/Foo.app";
    });
    const { user } = await renderApp(backend);
    await openFKeys(user);
    const row = await screen.findByRole("group", { name: "Ctrl+F5" });
    await user.click(within(row).getByRole("button", { name: "삭제" }));
    await waitFor(async () => expect(await fkeysOf(backend)).not.toHaveProperty("Ctrl+F5"));
    expect((await backend.getConfig()).config.fkey_apps).not.toHaveProperty("Ctrl+F5");
    expect(screen.queryByRole("group", { name: "Ctrl+F5" })).toBeNull();
  });

  it("설정에 저장된 조합 항목은 다시 열어도 줄로 복원된다", async () => {
    const backend = seedBackend();
    backend.setConfig((l) => {
      l.config.fkeys["Mod+Shift+F2"] = "core.rename";
    });
    const { user } = await renderApp(backend);
    await openFKeys(user);
    expect(await screen.findByRole("group", { name: "Mod+Shift+F2" })).toBeInTheDocument();
  });
});
