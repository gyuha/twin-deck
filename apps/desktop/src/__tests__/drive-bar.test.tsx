import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError, HostKeyError } from "@twin-deck/ts-client";
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
const pathNav = (side: "왼쪽" | "오른쪽") => screen.getAllByRole("navigation", { name: "경로" })[side === "왼쪽" ? 0 : 1];
const volButton = (side: "왼쪽" | "오른쪽", name: string) => within(bar(side)).getByRole("button", { name });
const leftCrumbs = () => crumbs();

describe("드라이브 바", () => {
  it("각 패널 위에 마운트된 볼륨 버튼이 나온다", async () => {
    await renderApp(setup());
    for (const side of ["왼쪽", "오른쪽"] as const) {
      await waitFor(() => expect(within(bar(side)).getAllByRole("button").map((b) => b.textContent)).toEqual(["/", "USB", "연결"]));
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
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    expect(pathNav("오른쪽")).toHaveTextContent("73.8 GB 남음");
    expect(within(pathNav("왼쪽")).getByText("73.8 GB 남음")).toHaveAttribute("title", "전체 500.0 GB");
  });

  it("다른 볼륨으로 가면 그 볼륨의 남은 용량으로 바뀐다", async () => {
    const { user } = await renderApp(setup());
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    expect(volButton("왼쪽", "USB")).toHaveAttribute("aria-pressed", "true"); // 볼륨 이름은 버튼의 강조로 알린다
    expect(pathNav("오른쪽")).toHaveTextContent("73.8 GB 남음"); // 오른쪽은 그대로
  });

  it("현재 볼륨을 언마운트하면 그 볼륨 안의 패널은 첫 번째 볼륨으로 옮겨지고 목록에서 빠진다", async () => {
    const backend = setup();
    const { user } = await renderApp(backend);
    await user.click(volButton("왼쪽", "USB"));
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    await user.click(within(info("왼쪽")).getByRole("button", { name: "언마운트" }));
    await waitFor(() => expect(backend.unmounted).toEqual(["/Volumes/USB"]));
    await waitFor(() => expect(leftCrumbs()).toEqual(["/"])); // 첫 번째 볼륨의 루트
    await waitFor(() => expect(within(bar("왼쪽")).queryByRole("button", { name: "USB" })).toBeNull());
    expect(within(bar("오른쪽")).queryByRole("button", { name: "USB" })).toBeNull();
    expect(volButton("왼쪽", "/")).toHaveAttribute("aria-pressed", "true");
  });

  it("루트 볼륨에는 언마운트 버튼이 없다", async () => {
    const { user } = await renderApp(setup());
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
    expect(within(bar("왼쪽")).queryByRole("button", { name: "언마운트" })).toBeNull();
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
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
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
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
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
    await waitFor(() => expect(pathNav("오른쪽")).toHaveTextContent("1.5 GB 남음"));
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
    await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
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
    expect(pathNav("왼쪽")).not.toHaveTextContent("남음");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("남은 용량은 경로 표시줄 오른쪽 끝, 언마운트는 드라이브 줄 오른쪽 끝", () => {
    it("남은 용량이 경로 표시줄의 오른쪽 끝(ml-auto)에 있고 툴팁에 전체 용량이 보인다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(within(pathNav("왼쪽")).getByText("73.8 GB 남음")).toBeInTheDocument());
      const free = within(pathNav("왼쪽")).getByText("73.8 GB 남음");
      expect(free.className).toContain("ml-auto");
      expect(free).toHaveAttribute("title", "전체 500.0 GB");
      expect(within(pathNav("오른쪽")).getByText("73.8 GB 남음")).toBeInTheDocument();
    });

    it("드라이브 바를 꺼도 남은 용량은 경로 표시줄에 그대로 보인다", async () => {
      const backend = setup();
      backend.setConfig((l) => (l.config.behavior.layout.show_drive_bar = false));
      await renderApp(backend);
      await waitFor(() => expect(within(pathNav("왼쪽")).getByText("73.8 GB 남음")).toBeInTheDocument());
      expect(screen.queryByRole("toolbar", { name: /^드라이브/ })).toBeNull();
    });

    it("드라이브 줄에는 용량이 없다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      expect(bar("왼쪽")).not.toHaveTextContent("남음");
    });

    it("루트가 아닌 볼륨이 현재일 때만 드라이브 줄 오른쪽 끝 블록(ml-auto)에 언마운트가 있고, 용량은 경로 표시줄에서 그 볼륨 것으로 바뀐다", async () => {
      const { user } = await renderApp(setup());
      await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      expect(screen.queryByRole("group", { name: "현재 볼륨 (왼쪽 패널)" })).toBeNull(); // 루트: 오른쪽 블록이 없다
      await user.click(volButton("왼쪽", "USB"));
      await waitFor(() => expect(within(bar("왼쪽")).getByRole("button", { name: "언마운트" })).toBeInTheDocument());
      const buttons = within(bar("왼쪽")).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["/", "USB", "연결", "언마운트"]);
      expect(info("왼쪽").className).toContain("ml-auto");
      expect(info("왼쪽")).toContainElement(buttons[3]);
      expect(info("왼쪽").textContent).toBe("⏏ 언마운트");
      await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("1.5 GB 남음"));
    });

    it("경로를 직접 입력하는 동안에는 남은 용량을 숨긴다", async () => {
      await renderApp(setup());
      await waitFor(() => expect(pathNav("왼쪽")).toHaveTextContent("73.8 GB 남음"));
      fireEvent.contextMenu(pathNav("왼쪽"));
      expect(await screen.findByRole("textbox", { name: "경로 입력" })).toBeInTheDocument();
      expect(pathNav("왼쪽")).not.toHaveTextContent("남음");
    });
  });

  describe("SMB 연결 메뉴 (이슈 #77)", () => {
    const NAS = { name: "NAS", host: "nas.local", share: "media", user: "kim" };
    const GUEST = { name: "공용", host: "nas.local", share: "public", user: "" };
    const OFFLINE = { name: "꺼진 서버", host: "offline", share: "data", user: "" };
    const withServers = (...servers: (typeof NAS)[]) => {
      const backend = setup();
      backend.setConfig((l) => (l.config.smb = { servers }));
      return backend;
    };
    const menu = () => screen.getByRole("dialog", { name: "서버에 연결" });
    const options = () => within(menu()).getAllByRole("option").map((o) => o.textContent?.trim());
    const openConnect = async (user: Awaited<ReturnType<typeof renderApp>>["user"], side: "왼쪽" | "오른쪽" = "왼쪽") => {
      await user.click(within(bar(side)).getByRole("button", { name: "연결" }));
      return menu();
    };
    const pick = async (user: Awaited<ReturnType<typeof renderApp>>["user"], name: string) =>
      user.click(within(menu()).getByRole("option", { name: new RegExp(name) }));
    const rightCrumbs = () =>
      within(pathNav("오른쪽"))
        .getAllByRole("button")
        .map((b) => b.textContent);
    const passwordDialog = () => screen.findByRole("dialog", { name: "NAS 비밀번호" });

    it("연결 메뉴에 저장된 항목과 구분선, SMB 서버 관리…가 보인다", async () => {
      const { user } = await renderApp(withServers(NAS, GUEST));
      await openConnect(user);
      expect(options()).toEqual(["1NAS", "2공용", "3SMB 서버 관리…", "4SFTP·FTP 관리…"]);
      expect(within(menu()).getByRole("separator")).toBeInTheDocument();
    });

    it("저장된 항목이 없으면 SMB 서버 관리…와 SFTP·FTP 관리…만 있다", async () => {
      const { user } = await renderApp(setup());
      await openConnect(user);
      expect(options()).toEqual(["1SMB 서버 관리…", "2SFTP·FTP 관리…"]);
      expect(within(menu()).queryByRole("separator")).toBeNull();
    });

    it("항목을 고르면 마운트하고 그 패널이 마운트 지점으로 이동한다(볼륨 버튼도 생긴다)", async () => {
      const { user } = await renderApp(withServers(GUEST));
      await openConnect(user, "오른쪽");
      await pick(user, "공용");
      await waitFor(() => expect(rightCrumbs()).toEqual(["/", "Volumes", "public"]));
      expect(screen.queryByRole("dialog", { name: "서버에 연결" })).toBeNull();
      expect(volButton("오른쪽", "public")).toHaveAttribute("aria-pressed", "true");
      expect(leftCrumbs()).toEqual(["/", "home", "a"]); // 다른 패널은 그대로
    });

    it("이미 마운트된 항목은 비밀번호를 묻지 않고 바로 이동한다", async () => {
      const backend = withServers(NAS);
      backend.volumes.push({ name: "media", mountPoint: "/Volumes/media" });
      backend.seed({ "/Volumes/media/movie.mkv": "m" });
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      await waitFor(() => expect(leftCrumbs()).toEqual(["/", "Volumes", "media"]));
      expect(screen.queryByRole("dialog", { name: "NAS 비밀번호" })).toBeNull();
    });

    it("저장된 비밀번호가 있으면 묻지 않고 연결한다", async () => {
      const backend = withServers(NAS);
      backend.smbPasswords.set("kim@nas.local/media", "secret");
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      await waitFor(() => expect(leftCrumbs()).toEqual(["/", "Volumes", "media"]));
      expect(screen.queryByRole("dialog", { name: "NAS 비밀번호" })).toBeNull();
    });

    it("인증이 필요하면 비밀번호를 묻고, 틀리면 다시 묻고, 맞으면 이동한다(기억하면 저장된다)", async () => {
      const backend = withServers(NAS);
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      let d = await passwordDialog();
      const input = within(d).getByLabelText("비밀번호");
      expect(input).toHaveAttribute("type", "password");
      expect(within(d).queryByRole("alert")).toBeNull(); // 처음에는 틀렸다는 안내가 없다
      await user.type(input, "bad{Enter}");
      d = await passwordDialog();
      expect(await within(d).findByRole("alert")).toHaveTextContent("비밀번호가 맞지 않습니다");
      expect(within(d).getByLabelText("비밀번호")).toHaveValue("");
      await user.click(within(d).getByRole("checkbox", { name: "비밀번호 기억" }));
      await user.type(within(d).getByLabelText("비밀번호"), "secret");
      await user.click(within(d).getByRole("button", { name: "확인" }));
      await waitFor(() => expect(leftCrumbs()).toEqual(["/", "Volumes", "media"]));
      expect(screen.queryByRole("dialog", { name: "NAS 비밀번호" })).toBeNull();
      expect(backend.smbPasswords.get("kim@nas.local/media")).toBe("secret");
    });

    it("비밀번호 창에서 Esc로 취소하면 연결하지 않고 이동하지 않는다", async () => {
      const backend = withServers(NAS);
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      await passwordDialog();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "NAS 비밀번호" })).toBeNull());
      expect(leftCrumbs()).toEqual(["/", "home", "a"]);
      expect(backend.volumes.map((v) => v.mountPoint)).not.toContain("/Volumes/media");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    // dialog 스코프는 모달이라(keymap MODAL_SCOPES) 바깥 pane 바인딩이 풀리지 않는다. 그 회귀 점검이다.
    it("비밀번호 입력 중의 패널 단축키(F8)는 패널로 가지 않는다", async () => {
      const backend = withServers(NAS);
      backend.seed({ "/home/a/keep.txt": "k" });
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      await passwordDialog();
      await user.keyboard("{F8}");
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.queryByRole("dialog", { name: /휴지통|삭제/ })).toBeNull();
      expect(backend.trashed).toEqual([]);
    });

    it("서버에 닿지 않으면 오류 메시지를 보이고 이동하지 않는다", async () => {
      const { user } = await renderApp(withServers(OFFLINE));
      await openConnect(user);
      await pick(user, "꺼진 서버");
      expect(await screen.findByText("서버나 공유에 연결할 수 없습니다")).toBeInTheDocument();
      expect(leftCrumbs()).toEqual(["/", "home", "a"]);
      expect(screen.queryByRole("dialog", { name: "꺼진 서버 비밀번호" })).toBeNull();
    });

    it("연결 중인 항목은 메뉴에서 '연결 중…'으로 비활성이다", async () => {
      const backend = withServers(GUEST);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const original = backend.smbConnect.bind(backend);
      let calls = 0;
      backend.smbConnect = async (...args) => {
        calls += 1;
        await gate;
        return original(...args);
      };
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "공용");
      await openConnect(user); // 연결 중에도 UI는 막히지 않는다
      const busy = within(menu()).getByRole("option", { name: /공용 — 연결 중…/ });
      expect(busy).toHaveAttribute("aria-disabled", "true");
      await user.click(busy); // 골라도 다시 연결하지 않는다
      expect(calls).toBe(1);
      await user.keyboard("{Escape}");
      release();
      await waitFor(() => expect(leftCrumbs()).toEqual(["/", "Volumes", "public"]));
      expect(calls).toBe(1);
    });

    // 백엔드는 항목을 순번으로 찾는다. 연결 중에 목록이 바뀌면 같은 순번이 다른 서버라서 비밀번호를 엉뚱한 서버로 보낼 수 있다.
    it("연결 중에 서버 목록이 바뀌면 비밀번호를 묻지 않고 멈춘다", async () => {
      const OTHER = { name: "다른 서버", host: "other.local", share: "media", user: "kim" };
      const backend = withServers(NAS, OTHER);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const original = backend.smbConnect.bind(backend);
      let calls = 0;
      backend.smbConnect = async (...args) => {
        calls += 1;
        await gate;
        return original(...args);
      };
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "NAS");
      await openConnect(user);
      await user.click(within(menu()).getByRole("option", { name: /SMB 서버 관리…/ }));
      const group = await screen.findByRole("group", { name: "저장된 SMB 서버" });
      await user.click(within(group).getByRole("button", { name: "삭제" })); // 0번 NAS를 지운다 → 0번이 "다른 서버"가 된다
      await user.click(within(group).getByRole("button", { name: "저장" }));
      await waitFor(async () => expect((await backend.getConfig()).config.smb.servers).toEqual([OTHER]));
      release();
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("dialog", { name: /비밀번호/ })).toBeNull();
      expect(calls).toBe(1);
      await user.keyboard("{Escape}"); // 설정을 닫으면 멈춘 이유가 보인다
      expect(await screen.findByText(/서버 목록이 바뀌어 연결을 멈췄습니다/)).toBeInTheDocument();
    });

    it("SMB 서버 관리…를 고르면 설정의 SMB 서버 탭이 열린다", async () => {
      const { user } = await renderApp(withServers(NAS));
      await openConnect(user);
      await user.click(within(menu()).getByRole("option", { name: /SMB 서버 관리…/ }));
      expect(await screen.findByRole("tab", { name: "SMB 서버" })).toHaveAttribute("aria-selected", "true");
    });

    it("메뉴는 키보드(↓·Return)로도 고른다", async () => {
      const { user } = await renderApp(withServers(GUEST));
      await openConnect(user);
      await user.keyboard("{ArrowDown}{Enter}");
      expect(await screen.findByRole("tab", { name: "SMB 서버" })).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("원격 연결 메뉴 (이슈 #76)", () => {
    const SFTP = { name: "회사", protocol: "sftp", host: "nas", port: 22, user: "kim", base_dir: "" };
    const FTP = { name: "공개", protocol: "ftp", host: "ftp.example.com", port: 21, user: "", base_dir: "/pub" };
    const OFFLINE = { name: "꺼진 서버", protocol: "sftp", host: "offline", port: 22, user: "kim", base_dir: "" };
    const withRemotes = (...servers: (typeof SFTP)[]) => {
      const backend = setup();
      backend.setConfig((l) => (l.config.remote = { servers }));
      backend.seed({ "sftp://kim@nas:22/docs/a.txt": "a", "sftp://kim@nas:22/b.txt": "b", "ftp://ftp.example.com:21/pub/p.txt": "p" });
      return backend;
    };
    const menu = () => screen.getByRole("dialog", { name: "서버에 연결" });
    const options = () => within(menu()).getAllByRole("option").map((o) => o.textContent?.trim());
    const openConnect = async (user: Awaited<ReturnType<typeof renderApp>>["user"], side: "왼쪽" | "오른쪽" = "왼쪽") => {
      await user.click(within(bar(side)).getByRole("button", { name: "연결" }));
      return menu();
    };
    const pick = async (user: Awaited<ReturnType<typeof renderApp>>["user"], name: string) =>
      user.click(within(menu()).getByRole("option", { name: new RegExp(name) }));
    const rightCrumbs = () =>
      within(pathNav("오른쪽"))
        .getAllByRole("button")
        .map((b) => b.textContent);
    const passwordDialog = () => screen.findByRole("dialog", { name: "회사 비밀번호" });

    const challenge = { host: "nas", port: 22, algorithm: "ssh-ed25519", fingerprint: "SHA256:test-fingerprint", publicKey: "ssh-ed25519 fake-test-key", previousFingerprint: null };

    for (const answer of ["취소", "미확인", "대조 후 취소", "승인"]) {
      it(`최초 SFTP 키 확인: ${answer} 때 명시적으로 대조한 키만 저장·연결한다`, async () => {
        const backend = withRemotes(SFTP);
        backend.remotePasswords.set("kim@nas:22/sftp", "secret");
        const original = backend.remoteConnect.bind(backend);
        const approvals: (string | undefined)[] = [];
        let trusted = false;
        backend.remoteConnect = async (i, p, r, approved) => {
          approvals.push(approved);
          if (!trusted && approved !== challenge.publicKey) throw new HostKeyError(challenge);
          trusted = true;
          return original(i, p, r);
        };
        const { user } = await renderApp(backend);
        await openConnect(user);
        await pick(user, "SFTP · 회사");
        const d = await screen.findByRole("dialog", { name: "SFTP 서버 신원 확인" });
        expect(within(d).getByText("nas:22")).toBeVisible();
        expect(within(d).getByText("ssh-ed25519")).toBeVisible();
        expect(within(d).getByText(challenge.fingerprint)).toBeVisible();
        expect(within(d).queryByRole("textbox")).toBeNull();
        const approve = within(d).getByRole("button", { name: "승인하고 연결" });
        expect(approve).toBeDisabled();
        expect(within(d).getByRole("button", { name: "취소" })).toHaveFocus();
        if (answer === "승인") {
          await user.click(within(d).getByRole("checkbox", { name: /신뢰할 경로/ }));
          expect(approve).toBeEnabled();
          await user.click(approve);
        } else if (answer === "대조 후 취소") {
          await user.click(within(d).getByRole("checkbox", { name: /신뢰할 경로/ }));
          await user.keyboard("{Enter}");
          expect(approvals).toEqual([undefined]);
          await user.keyboard("{Escape}");
        } else {
          await user.click(approve);
          expect(approvals).toEqual([undefined]);
          if (answer === "미확인") {
            await user.keyboard("{Enter}");
            expect(approvals).toEqual([undefined]);
            await user.click(within(d).getByRole("button", { name: "취소" }));
          }
          else await user.keyboard("{Escape}");
        }
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "SFTP 서버 신원 확인" })).toBeNull());
        if (answer === "승인") {
          await waitFor(async () => expect(await backend.remoteConnections()).toEqual([0]));
          expect(approvals).toEqual([undefined, challenge.publicKey]);
          await user.click(within(bar("왼쪽")).getByRole("button", { name: "연결 끊기" }));
          await openConnect(user);
          await pick(user, "SFTP · 회사");
          await waitFor(async () => expect(await backend.remoteConnections()).toEqual([0]));
          expect(screen.queryByRole("dialog", { name: "SFTP 서버 신원 확인" })).toBeNull();
        } else {
          expect(trusted).toBe(false);
          expect(await backend.remoteConnections()).toEqual([]);
        }
      });
    }

    it("변경된 SFTP 키는 기존·새 지문과 위험을 표시하고 다시 인증하지 않는다", async () => {
      const backend = withRemotes(SFTP);
      let calls = 0;
      backend.remoteConnect = async () => { calls++; throw new HostKeyError({ ...challenge, previousFingerprint: "SHA256:old" }); };
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "SFTP · 회사");
      expect(await screen.findByText(/SFTP 서버 키가 변경되어 인증을 차단/)).toHaveTextContent(/SHA256:old.*SHA256:test-fingerprint/);
      expect(screen.getByText(/서버 사칭 위험/)).toBeVisible();
      expect(calls).toBe(1);
      expect(screen.queryByRole("dialog", { name: "SFTP 서버 신원 확인" })).toBeNull();
    });

    it("연결 메뉴에 저장된 원격 항목이 프로토콜과 함께 보이고 SFTP·FTP 관리…가 있다", async () => {
      const { user } = await renderApp(withRemotes(SFTP, FTP));
      await openConnect(user);
      expect(options()).toEqual(["1SFTP · 회사", "2FTP · 공개", "3SMB 서버 관리…", "4SFTP·FTP 관리…"]);
    });

    it("SFTP 항목을 고르면 비밀번호를 묻고 맞으면 그 패널이 원격 루트로 이동한다(기억하면 저장된다)", async () => {
      const backend = withRemotes(SFTP);
      const { user } = await renderApp(backend);
      await openConnect(user, "오른쪽");
      await pick(user, "SFTP · 회사");
      let d = await passwordDialog();
      await user.type(within(d).getByLabelText("비밀번호"), "bad{Enter}");
      d = await passwordDialog();
      expect(await within(d).findByRole("alert")).toHaveTextContent("비밀번호가 맞지 않습니다");
      await user.click(within(d).getByRole("checkbox", { name: "비밀번호 기억" }));
      await user.type(within(d).getByLabelText("비밀번호"), "secret");
      await user.click(within(d).getByRole("button", { name: "확인" }));
      await waitFor(() => expect(rightCrumbs()).toEqual(["sftp://kim@nas:22/"]));
      expect(screen.queryByRole("dialog", { name: "회사 비밀번호" })).toBeNull();
      expect(backend.remotePasswords.get("kim@nas:22/sftp")).toBe("secret");
      expect(leftCrumbs()).toEqual(["/", "home", "a"]); // 다른 패널은 그대로
      // 원격 폴더는 어느 로컬 볼륨에도 속하지 않아 볼륨 버튼이 강조되지 않고 "연결 끊기"가 보인다.
      expect(volButton("오른쪽", "/")).toHaveAttribute("aria-pressed", "false");
      expect(within(bar("오른쪽")).getByRole("button", { name: "연결 끊기" })).toBeInTheDocument();
      expect(within(bar("왼쪽")).queryByRole("button", { name: "연결 끊기" })).toBeNull();
    });

    it("저장된 비밀번호가 있으면 묻지 않고 연결하고, 익명 FTP는 시작 폴더로 간다", async () => {
      const backend = withRemotes(SFTP, FTP);
      backend.remotePasswords.set("kim@nas:22/sftp", "secret");
      const { user } = await renderApp(backend);
      await openConnect(user, "오른쪽");
      await pick(user, "SFTP · 회사");
      await waitFor(() => expect(rightCrumbs()).toEqual(["sftp://kim@nas:22/"]));
      expect(screen.queryByRole("dialog", { name: "회사 비밀번호" })).toBeNull();
      await openConnect(user, "오른쪽");
      await pick(user, "FTP · 공개");
      await waitFor(() => expect(rightCrumbs()).toEqual(["ftp://ftp.example.com:21/", "pub"]));
    });

    it("비밀번호 창에서 Esc로 취소하면 연결하지 않고 이동하지 않는다", async () => {
      const backend = withRemotes(SFTP);
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "SFTP · 회사");
      await passwordDialog();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "회사 비밀번호" })).toBeNull());
      expect(leftCrumbs()).toEqual(["/", "home", "a"]);
      expect(await backend.remoteConnections()).toEqual([]);
    });

    it("서버에 닿지 않으면 오류 메시지를 보이고 이동하지 않는다", async () => {
      const backend = withRemotes(OFFLINE);
      backend.remotePasswords.set("kim@offline:22/sftp", "pw");
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "꺼진 서버");
      expect(await screen.findByText("서버에 연결할 수 없습니다")).toBeInTheDocument();
      expect(leftCrumbs()).toEqual(["/", "home", "a"]);
    });

    it("연결 중인 항목은 메뉴에서 '연결 중…'으로 비활성이고 다시 연결하지 않는다", async () => {
      const backend = withRemotes(FTP);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const original = backend.remoteConnect.bind(backend);
      let calls = 0;
      backend.remoteConnect = async (...args) => {
        calls += 1;
        await gate;
        return original(...args);
      };
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "FTP · 공개");
      await openConnect(user);
      const busy = within(menu()).getByRole("option", { name: /FTP · 공개 — 연결 중…/ });
      expect(busy).toHaveAttribute("aria-disabled", "true");
      await user.click(busy);
      release();
      await waitFor(() => expect(leftCrumbs()).toEqual(["ftp://ftp.example.com:21/", "pub"]));
      expect(calls).toBe(1);
    });

    it("연결 중에 서버 목록이 바뀌면 비밀번호를 묻지 않고 멈춘다", async () => {
      const backend = withRemotes(SFTP);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const original = backend.remoteConnect.bind(backend);
      backend.remoteConnect = async (...args) => {
        await gate;
        return original(...args);
      };
      const { user } = await renderApp(backend);
      await openConnect(user);
      await pick(user, "SFTP · 회사");
      await backend.setRemoteServers([{ ...SFTP, host: "other" }]);
      release();
      expect(await screen.findByText(/원격 서버 목록이 바뀌어 연결을 멈췄습니다/)).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "회사 비밀번호" })).toBeNull();
    });

    it("SFTP·FTP 관리…를 고르면 설정의 SFTP·FTP 서버 탭이 열린다", async () => {
      const { user } = await renderApp(withRemotes(SFTP));
      await openConnect(user);
      await pick(user, "SFTP·FTP 관리…");
      expect(await screen.findByRole("tab", { name: "SFTP·FTP 서버" })).toHaveAttribute("aria-selected", "true");
    });

    it("연결 끊기를 누르면 그 연결 안의 모든 탭이 홈으로 나오고 연결이 닫힌다", async () => {
      const backend = withRemotes(SFTP);
      backend.remotePasswords.set("kim@nas:22/sftp", "pw");
      const { user } = await renderApp(backend);
      await openConnect(user, "오른쪽");
      await pick(user, "SFTP · 회사");
      await waitFor(() => expect(rightCrumbs()).toEqual(["sftp://kim@nas:22/"]));
      expect(await backend.remoteConnections()).toEqual([0]);
      await user.click(within(bar("오른쪽")).getByRole("button", { name: "연결 끊기" }));
      await waitFor(() => expect(rightCrumbs()).toEqual(["/", "home", "a"]));
      expect(await backend.remoteConnections()).toEqual([]);
      expect(within(bar("오른쪽")).queryByRole("button", { name: "연결 끊기" })).toBeNull();
    });
  });
});
