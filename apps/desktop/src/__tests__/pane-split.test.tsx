import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@twin-deck/ts-client";
import { renderApp, seedBackend } from "./helpers";

const SAVE_WAIT = { timeout: 3000 };
const sep = () => screen.getByRole("separator", { name: "패널 너비 조절" });
const leftWidth = () => (screen.getByRole("region", { name: "왼쪽 패널" }).parentElement as HTMLElement).style.width;
const snap = (split: number): Snapshot => ({
  version: 1,
  activePane: "left",
  showHidden: false,
  paletteQuery: "",
  split,
  left: { tabs: [{ path: "/home/a", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
  right: { tabs: [{ path: "/home/b", cursorName: null, selection: [], sort: null, view: { mode: "table", count: 1 } }], active: 0 },
});
/** jsdom에는 레이아웃, PointerEvent, 포인터 캡처가 없어서, 너비 1000px인 컨테이너와 항상 캡처된 포인터를 흉내 낸다. */
const drag = (to: number) => {
  const el = sep();
  (el.parentElement as HTMLElement).getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
  el.setPointerCapture = () => undefined;
  el.releasePointerCapture = () => undefined;
  el.hasPointerCapture = () => true;
  const at = (type: string, clientX: number) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
  at("pointerdown", 500);
  at("pointermove", to);
  at("pointerup", to);
};

describe("패널 너비 조절", () => {
  it("처음에는 반반이다", async () => {
    await renderApp();
    expect(leftWidth()).toBe("50%");
  });

  it("구분선을 끌면 비율이 바뀌고 저장된다", async () => {
    const { backend } = await renderApp(seedBackend());
    drag(300);
    await waitFor(() => expect(leftWidth()).toBe("30%"));
    expect(sep()).toHaveAttribute("aria-valuenow", "30");
    await waitFor(() => expect(backend.savedStates.at(-1)?.split).toBe(300), SAVE_WAIT);
  });

  it("너무 좁게 끌어도 한쪽 패널이 사라지지 않는다", async () => {
    await renderApp();
    drag(10);
    await waitFor(() => expect(leftWidth()).toBe("15%"));
    drag(995);
    await waitFor(() => expect(leftWidth()).toBe("85%"));
  });

  it("저장된 비율로 시작하고 더블클릭하면 반반으로 돌아간다", async () => {
    await renderApp(seedBackend(), "linux", undefined, { snapshot: snap(700) });
    expect(leftWidth()).toBe("70%");
    fireEvent.doubleClick(sep());
    await waitFor(() => expect(leftWidth()).toBe("50%"));
  });
});
