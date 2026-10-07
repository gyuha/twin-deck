import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
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

describe("Windows 경로 표시줄", () => {
  it("드라이브 루트와 폴더별 링크로 나뉘고 앞에 /가 붙지 않는다", () => {
    renderCrumb("C:\\Program Files\\Aside\\Application");
    expect(labels()).toEqual(["C:\\", "Program Files", "Aside", "Application"]);
  });

  it("중간 폴더를 누르면 그 폴더의 전체 경로로 이동한다", async () => {
    const api = renderCrumb("C:\\Program Files\\Aside\\Application");
    await userEvent.click(screen.getByRole("button", { name: "Aside" }));
    expect(api.navigate).toHaveBeenCalledWith("C:\\Program Files\\Aside");
    await userEvent.click(screen.getByRole("button", { name: "C:\\" }));
    expect(api.navigate).toHaveBeenCalledWith("C:\\");
  });

  it("드라이브 루트만 있으면 버튼은 하나다", () => {
    renderCrumb("C:\\");
    expect(labels()).toEqual(["C:\\"]);
  });

  it("기존 / 경로는 그대로다", () => {
    renderCrumb("/home/a");
    expect(labels()).toEqual(["/", "home", "a"]);
  });
});
