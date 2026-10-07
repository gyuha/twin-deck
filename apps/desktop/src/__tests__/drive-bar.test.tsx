import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError } from "@twin-deck/ts-client";
import { crumbs } from "./search-helpers";
import { renderApp, seedBackend } from "./helpers";

const GB = 1e9;
// 왼쪽 /home/a, 오른쪽 /home/b. 볼륨: "/"와 "/Volumes/USB"(fake 기본값).
const setup = () => {
  const backend = seedBackend().seed({ "/Volumes/USB/docs/x.txt": "x", "/Volumes/USB/y.txt": "y" });
  backend.diskSpaces = { "/": { free: 73.8 * GB, total: 500 * GB }, "/Volumes/USB": { free: 1.5 * GB, total: 8 * GB } };
  return backend;
};
const bar = (side: "왼쪽" | "오른쪽") => screen.getByRole("toolbar", { name: `드라이브 (${side} 패널)` });
const info = (side: "왼쪽" | "오른쪽") => screen.getByRole("group", { name: `현재 볼륨 (${side} 패널)` });
const volButton = (side: "왼쪽" | "오른쪽", name: string) => within(bar(side)).getByRole("button", { name });
const leftCrumbs = () => crumbs();

describe("드라이브 바", () => {
  it("각 패널 위에 마운트된 볼륨 버튼이 나온다", async () => {
    await renderApp(setup());
    for (const side of ["왼쪽", "오른쪽"] as const) {
      await waitFor(() => expect(within(bar(side)).getAllByRole("button").map((b) => b.textContent)).toEqual(["/", "USB"]));
    }
  });

  it("현재 폴더가 속한 볼륨이 강조된다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await waitFor(() => expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true"));
    expect(volButton("왼쪽", "USB")).toHaveAttribute("aria-pressed", "false");
    // 오른쪽 패널을 USB로 보내면 그 패널만 USB가 강조된다
    await user.click(volButton("오른쪽", "USB"));
    await waitFor(() => expect(volButton("오른쪽", "USB")).toHaveAttribute("aria-pressed", "true"));
    expect(volButton("오른쪽", "/")).toHaveAttribute("aria-pressed", "false");
    expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true");
  });

  it("볼륨 버튼을 누르면 그 패널이 그 볼륨의 루트로 이동한다", async () => {
    const { user } = await renderApp(setup());
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(leftCrumbs()).toEqual(["/", "Volumes", "USB"]));
    expect(screen.getByRole("region", { name: "왼쪽 패널" })).toHaveTextContent("docs");
  });

  it("현재 볼륨의 남은 용량이 표시된다", async () => {
    await renderApp(setup());
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    expect(info("오른쪽")).toHaveTextContent("73.8 GB 남음");
    expect(within(info("왼쪽")).getByText("73.8 GB 남음")).toHaveAttribute("title", "전체 500.0 GB");
  });

  it("다른 볼륨으로 가면 그 볼륨의 남은 용량으로 바뀐다", async () => {
    const { user } = await renderApp(setup());
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    expect(volButton("왼쪽", "USB")).toHaveAttribute("aria-pressed", "true"); // 볼륨 이름은 버튼의 강조로 알린다
    expect(info("오른쪽")).toHaveTextContent("73.8 GB 남음"); // 오른쪽은 그대로
  });

  it("현재 볼륨을 언마운트하면 그 볼륨 안의 패널은 첫 번째 볼륨으로 옮겨지고 목록에서 빠진다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    await waitFor(() => expect(backend.unmounted).toEqual(["/Volumes/USB"]));
    await waitFor(() => expect(leftCrumbs()).toEqual(["/"])); // 첫 번째 볼륨의 루트
    await waitFor(() => expect(within(bar("왼쪽")).queryByRole("button", { name: "USB" })).toBeNull());
    expect(within(bar("오른쪽")).queryByRole("button", { name: "USB" })).toBeNull();
    expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true");
  });

  it("루트 볼륨에는 언마운트 버튼이 없다", async () => {
    const { user } = await renderApp(setup());
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    expect(within(info("왼쪽")).queryByRole("button", { name: "언마운트" })).toBeNull();
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(within(info("왼쪽")).getByRole("button", { name: "언마운트" })).toBeInTheDocument());
  });

  it("언마운트에 실패하면 알리지만 패널은 이미 첫 번째 볼륨으로 옮겨져 있다", async () => {
    const backend = setup();
    backend.unmountVolume = async () => {
      throw new BackendError("사용 중이라 언마운트할 수 없습니다");
    };
    const { user } = await renderApp(backend);
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    expect(await screen.findByText(/사용 중이라 언마운트할 수 없습니다/)).toBeInTheDocument();
    expect(leftCrumbs()).toEqual(["/"]);
    expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true");
  });

  // Windows는 앱이 폴더 감시로 잡고 있는 드라이브를 "사용 중"이라며 꺼내 주지 않는다.
  const trackWatches = (backend: ReturnType<typeof setup>) => {
    const log: string[] = [];
    const { watch, unwatch, unmountVolume } = backend;
    backend.watch = async (p) => {
      log.push(`watch ${p}`);
      return watch.call(backend, p);
    };
    backend.unwatch = async (p) => {
      log.push(`unwatch ${p}`);
      return unwatch.call(backend, p);
    };
    backend.unmountVolume = async (mp) => {
      log.push(`unmount ${mp}`);
      return unmountVolume.call(backend, mp);
    };
    return log;
  };

  it("언마운트를 시도하기 전에 그 볼륨 안의 폴더 감시를 푼다", async () => {
    const backend = setup();
    const log = trackWatches(backend);
    const { user } = await renderApp(backend);
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    await waitFor(() => expect(log).toContain("watch /Volumes/USB"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    await waitFor(() => expect(log).toContain("unmount /Volumes/USB"));
    expect(log.indexOf("unwatch /Volumes/USB")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("unwatch /Volumes/USB")).toBeLessThan(log.indexOf("unmount /Volumes/USB"));
  });

  it("반대쪽 패널도 같은 볼륨이면 둘 다 첫 번째 볼륨으로 옮긴다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.click(volButton("왼쪽", "USB"));
    await user.click(volButton("오른쪽", "USB"));
    await waitFor(() => expect(info("오른쪽")).toHaveTextContent("1.5 GB 남음"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    await waitFor(() => expect(backend.unmounted).toEqual(["/Volumes/USB"]));
    const rightCrumbs = () =>
      within(screen.getAllByRole("navigation", { name: "경로" })[1])
        .getAllByRole("button")
        .map((b) => b.textContent);
    await waitFor(() => expect(leftCrumbs()).toEqual(["/"]));
    await waitFor(() => expect(rightCrumbs()).toEqual(["/"]));
  });

  it("다른 볼륨에 있는 반대쪽 패널은 옮기지 않는다", async () => {
    const { user } = await renderApp(setup());
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    await waitFor(() => expect(leftCrumbs()).toEqual(["/"]));
    const right = within(screen.getAllByRole("navigation", { name: "경로" })[1]).getAllByRole("button");
    expect(right.map((b) => b.textContent)).toEqual(["/", "home", "b"]);
  });

  it("용량을 알 수 없으면 남은 용량을 표시하지 않고 오류도 내지 않는다", async () => {
    const backend = setup();
    backend.diskSpaces = {}; // 어느 볼륨도 용량을 못 읽는다
    await renderApp(backend);
    await waitFor(() => expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true"));
    await new Promise((r) => setTimeout(r, 50));
    expect(info("왼쪽")).not.toHaveTextContent("남음");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("한 줄: 볼륨 버튼 줄의 오른쪽 끝에 남은 용량·언마운트", () => {
    it("남은 용량 글자가 드라이브 툴바 안에 있다(별도의 둘째 줄이 아니다)", async () => {
      await renderApp(setup());
      await waitFor(() => expect(within(bar("왼쪽")).getByText("73.8 GB 남음")).toBeInTheDocument());
      expect(within(bar("오른쪽")).getByText("73.8 GB 남음")).toBeInTheDocument();
    });

    it("'현재 볼륨' 그룹에는 용량만 있고 볼륨 이름 글자는 없다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      expect(info("왼쪽").textContent).toBe("73.8 GB 남음");
    });

    it("드라이브 바는 한 줄이다: 툴바 말고 다른 줄이 없다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      expect(bar("왼쪽").parentElement?.children).toHaveLength(1);
      expect(bar("오른쪽").parentElement?.children).toHaveLength(1);
    });

    it("루트가 아닌 볼륨이 현재일 때 언마운트가 툴바의 마지막 버튼이고 오른쪽 끝 블록(ml-auto)에 있다", async () => {
      const { user } = await renderApp(setup());
      await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      await user.click(volButton("왼쪽", "USB"));
      await waitFor(() => expect(within(bar("왼쪽")).getByRole("button", { name: "언마운트" })).toBeInTheDocument());
      const buttons = within(bar("왼쪽")).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["/", "USB", "언마운트"]);
      expect(info("왼쪽").className).toContain("ml-auto");
      expect(info("왼쪽")).toContainElement(buttons[2]);
      expect(info("왼쪽")).toHaveTextContent("1.5 GB 남음");
    });

    it("루트가 현재일 때는 오른쪽 끝에 용량만 있고 언마운트는 없다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(info("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      expect(within(bar("왼쪽")).queryByRole("button", { name: "언마운트" })).toBeNull();
    });
  });
});

