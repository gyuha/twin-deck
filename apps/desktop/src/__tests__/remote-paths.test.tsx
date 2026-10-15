import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { joinPath, parentPath, remoteRoot } from "@twin-deck/ts-client";
import { Breadcrumb } from "../ui/Breadcrumb";
import { StoreContext } from "../state/context";
import type { AppStore } from "../state/store";

function renderCrumb(path: string) {
  const api = { activate: vi.fn(), navigate: vi.fn().mockResolvedValue(undefined) };
  const store = createStore(() => ({ diskSpace: { left: null, right: null }, loaded: { config: { display: { size_format: "auto" } } } }));
  render(
    <StoreContext.Provider value={{ api, store } as unknown as AppStore}>
      <Breadcrumb pane="left" path={path} />
    </StoreContext.Provider>,
  );
  return api;
}

const labels = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("원격 경로 td://별칭/경로 (ADR-0018)", () => {
  it("원격 루트는 td://별칭이고 그 위로는 올라가지 않는다", () => {
    expect(remoteRoot("td://office/Users/me")).toBe("td://office");
    expect(remoteRoot("td://office")).toBe("td://office");
    expect(remoteRoot("/Users/me")).toBeNull();
    expect(parentPath("td://office/Users/me")).toBe("td://office/Users");
    expect(parentPath("td://office/Users")).toBe("td://office");
    expect(parentPath("td://office")).toBeNull();
    expect(parentPath("td://office/")).toBeNull();
    expect(joinPath("td://office", "Users")).toBe("td://office/Users");
  });

  it("경로 표시줄은 원격 루트부터 나뉘고 누르면 원격 경로로 이동한다", async () => {
    const api = renderCrumb("td://office/Users/me");
    expect(labels()).toEqual(["td://office", "Users", "me"]);
    await userEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(api.navigate).toHaveBeenCalledWith("td://office/Users");
    await userEvent.click(screen.getByRole("button", { name: "td://office" }));
    expect(api.navigate).toHaveBeenCalledWith("td://office");
  });

  it("Windows 원격은 드라이브까지 원격 경로로 이어진다", () => {
    renderCrumb("td://win/C:/Users");
    expect(labels()).toEqual(["td://win", "C:", "Users"]);
  });
});
