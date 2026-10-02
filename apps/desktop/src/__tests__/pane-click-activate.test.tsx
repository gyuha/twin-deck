import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeBackend } from "@twin-deck/ts-client";
import { activePane, renderApp } from "./helpers";

describe("패널 클릭 활성화", () => {
  it("비활성 패널의 파일이 아닌 부분(경로 줄)을 눌러도 그 패널이 활성화된다", async () => {
    const backend = new FakeBackend().seed({ "/home/a/x.txt": "x", "/home/b/y.txt": "y" });
    const { user } = await renderApp(backend);
    expect(activePane()).toBe("left");

    const right = screen.getByRole("region", { name: "오른쪽 패널" });
    await user.click(right.querySelector("nav, [aria-label]:not(section)") ?? right);
    expect(activePane()).toBe("right");
  });
});
