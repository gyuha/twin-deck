import { afterEach, describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { list, renderApp } from "./helpers";

// 화면 배율이 100%가 아닌 Windows에서는 clientHeight가 소수이고, 브라우저는 scrollTop을 물리 픽셀로 반올림한다.
// 그래서 설정한 값과 읽은 값이 달라진다. jsdom에는 없는 이 동작을 흉내 낸다.
const stored = new WeakMap<Element, number>();
const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

const userAgent = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent");

afterEach(() => {
  if (userAgent) Object.defineProperty(Navigator.prototype, "userAgent", userAgent);
  if (scrollTop) Object.defineProperty(Element.prototype, "scrollTop", scrollTop);
  if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
});

describe("커서를 따라가는 스크롤", () => {
  it("scrollTop이 반올림되는 화면(배율 125% 등)에서도 실제 스크롤을 막지 않는다", async () => {
    // 실제 브라우저처럼 보이게 한다(FileTable의 jsdom 보정이 꺼진다).
    Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: () => "Mozilla/5.0 Chrome/120" });
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get(this: Element) {
        return stored.get(this) ?? 0;
      },
      set(this: Element, v: number) {
        stored.set(this, Math.round(v));
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 479.5;
      },
    });
    const files = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`/home/a/f${String(i).padStart(2, "0")}.txt`, "x"]));
    const { user } = await renderApp(new FakeBackend().seed(files));

    await user.keyboard("{ArrowDown>40/}");

    const box = list("left");
    // 가짜 scrollTop 속성으로 덮어쓰지 않았어야 하고, 실제로 아래로 스크롤돼 있어야 한다.
    expect(Object.getOwnPropertyDescriptor(box, "scrollTop")).toBeUndefined();
    expect(box.scrollTop).toBeGreaterThan(400);
  });
});
