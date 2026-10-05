import { beforeEach, describe, expect, it, vi } from "vitest";

// 실제 Tauri 메뉴 대신 호출을 기록하는 가짜를 쓴다(jsdom에는 네이티브 메뉴가 없다).
const calls: string[] = [];
const focusHandlers: ((e: { payload: boolean }) => void)[] = [];
const created: { id?: string; text?: string; action?: () => void }[] = [];
let submenus: FakeSubmenu[] = [];
let prepended: unknown[] = [];

const renamed: string[] = [];
const viewAdds: unknown[] = [];
const checks: { id: string; text: string; checked: boolean; action: () => void }[] = [];
class FakeItem {
  constructor(public label: string) {}
  async text() {
    return this.label;
  }
  async setText(t: string) {
    renamed.push(`${this.label}->${t}`);
    this.label = t;
  }
}

class FakeSubmenu {
  constructor(public label: string, public children: FakeItem[] = []) {}
  async text() {
    return this.label;
  }
  async setText(t: string) {
    renamed.push(`${this.label}->${t}`);
    this.label = t;
  }
  async items() {
    return this.children;
  }
  async append(item: unknown) {
    viewAdds.push(item);
  }
  async prepend(items: unknown[]) {
    calls.push(`prepend:${this.label}:${items.length}`);
    prepended = items;
  }
  static async new(o: { text: string }) {
    calls.push(`newSubmenu:${o.text}`);
    return new FakeSubmenu(o.text);
  }
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: async (h: (e: { payload: boolean }) => void) => {
      focusHandlers.push(h);
      return () => void focusHandlers.splice(focusHandlers.indexOf(h), 1);
    },
  }),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Submenu: FakeSubmenu,
  MenuItem: {
    new: async (o: { id: string; text: string; action: () => void }) => {
      created.push(o);
      return o;
    },
  },
  CheckMenuItem: {
    new: async (o: { id: string; text: string; checked: boolean; action: () => void }) => {
      checks.push(o);
      return o;
    },
  },
  PredefinedMenuItem: { new: async (o: { item: string }) => ({ separator: o.item === "Separator" }) },
  Menu: {
    default: async () => ({
      items: async () => submenus,
      insert: async (item: FakeSubmenu, pos: number) => {
        calls.push(`insert:${item.label}@${pos}`);
        submenus.splice(pos, 0, item);
      },
      setAsAppMenu: async () => void calls.push("setAsAppMenu"),
    }),
  },
}));

const { FILE_MENU, installFileMenu, installFileMenuForWindow, appItemLabel } = await import("../appMenu");

beforeEach(() => {
  calls.length = 0;
  focusHandlers.length = 0;
  created.length = 0;
  prepended = [];
  renamed.length = 0;
  viewAdds.length = 0;
  checks.length = 0;
  submenus = [new FakeSubmenu("twin-deck"), new FakeSubmenu("File"), new FakeSubmenu("Edit"), new FakeSubmenu("View")];
});

describe("상단 메뉴바 File 메뉴", () => {
  it("기본 메뉴의 File 맨 앞에 항목을 끼워 넣고 앱 메뉴로 지정한다", async () => {
    await installFileMenu(() => {});
    expect(calls).toEqual([`prepend:File:${FILE_MENU.length}`, "setAsAppMenu"]);
    expect(created.map((c) => c.text)).toEqual(FILE_MENU.flatMap((e) => (e ? [e.text] : [])));
    expect(prepended).toHaveLength(FILE_MENU.length);
  });

  it("다중 이름 바꾸기와 자주 쓰는 파일 메뉴가 들어 있다", () => {
    const texts = FILE_MENU.flatMap((e) => (e ? [e.text] : []));
    expect(texts).toEqual([
      "새 폴더",
      "새 파일",
      "열기",
      "편집",
      "파일 관리자에서 보기",
      "복사",
      "이동",
      "이름 변경",
      "다중 이름 바꾸기",
      "압축",
      "압축 풀기",
      "휴지통으로 이동",
      "영구 삭제",
      "파일 정보",
    ]);
  });

  it("항목을 누르면 대응하는 액션 ID로 실행기를 부른다", async () => {
    const run = vi.fn();
    await installFileMenu(run);
    created.find((c) => c.text === "다중 이름 바꾸기")!.action!();
    created.find((c) => c.text === "복사")!.action!();
    expect(run.mock.calls).toEqual([["core.rename.multi"], ["core.copy"]]);
  });

  it("단축키(accelerator)를 달지 않는다", async () => {
    await installFileMenu(() => {});
    for (const c of created) expect(c).not.toHaveProperty("accelerator");
  });

  it("앱 메뉴의 제목과 About/Hide/Quit 항목을 Twin Deck으로 바꾼다", async () => {
    submenus = [
      new FakeSubmenu("twin-deck", [
        new FakeItem("About twin-deck-desktop"),
        new FakeItem("Services"),
        new FakeItem("Hide twin-deck-desktop"),
        new FakeItem("Hide Others"),
        new FakeItem("Quit twin-deck-desktop"),
      ]),
      new FakeSubmenu("File"),
    ];
    await installFileMenu(() => {});
    expect(renamed).toEqual([
      "twin-deck->Twin Deck",
      "About twin-deck-desktop->About Twin Deck",
      "Hide twin-deck-desktop->Hide Twin Deck",
      "Quit twin-deck-desktop->Quit Twin Deck",
    ]);
  });

  it("View 메뉴 끝에 드라이브 바와 Action Bar를 켜고 끄는 체크 항목이 붙고 체크 표시는 현재 설정을 따른다", async () => {
    await installFileMenu(() => {}, { driveBar: true, actionBar: false });
    expect(checks.map((c) => [c.id, c.text, c.checked])).toEqual([
      ["core.view.drive_bar", "드라이브 바 표시", true],
      ["core.view.action_bar", "Action Bar 표시", false],
    ]);
    expect(viewAdds).toHaveLength(3); // 구분선 + 항목 2개
    expect(viewAdds[0]).toEqual({ separator: true });
  });

  it("보기 단축키: keyOf를 주면 View 항목 글자에 키가 붙고 accelerator는 달지 않는다", async () => {
    const keys: Record<string, string> = { "core.view.drive_bar": "Cmd+Shift+D", "core.view.action_bar": "Cmd+Shift+A" };
    await installFileMenu(() => {}, { driveBar: true, actionBar: true }, (id) => keys[id]);
    expect(checks.map((c) => c.text)).toEqual(["드라이브 바 표시 (Cmd+Shift+D)", "Action Bar 표시 (Cmd+Shift+A)"]);
    for (const c of checks) expect(c).not.toHaveProperty("accelerator");
  });

  it("다중 이름 바꾸기 단축키: keyOf를 주면 File 메뉴 항목 글자에 키가 붙고 accelerator는 달지 않는다", async () => {
    const keys: Record<string, string> = { "core.rename.multi": "Cmd+Shift+R" };
    await installFileMenu(() => {}, undefined, (id) => keys[id]);
    expect(created.find((c) => c.id === "core.rename.multi")!.text).toBe("다중 이름 바꾸기 (Cmd+Shift+R)");
    expect(created.find((c) => c.id === "core.copy")!.text).toBe("복사"); // 키가 없으면 글자 그대로
    for (const c of created) expect(c).not.toHaveProperty("accelerator");
  });

  it("체크 항목을 누르면 대응하는 액션 ID로 실행기를 부른다", async () => {
    const run = vi.fn();
    await installFileMenu(run);
    checks[0].action();
    checks[1].action();
    expect(run.mock.calls).toEqual([["core.view.drive_bar"], ["core.view.action_bar"]]);
  });

  it("View 메뉴가 없으면 만들어 세 번째 자리에 넣는다", async () => {
    submenus = [new FakeSubmenu("twin-deck"), new FakeSubmenu("File"), new FakeSubmenu("Edit")];
    await installFileMenu(() => {});
    expect(calls).toContain("newSubmenu:View");
    expect(calls).toContain("insert:View@2");
  });

  it("appItemLabel: 앱 이름이 든 항목만 바꾼다", () => {
    expect(appItemLabel("About twin-deck-desktop")).toBe("About Twin Deck");
    expect(appItemLabel("Quit Foo Bar")).toBe("Quit Twin Deck");
    expect(appItemLabel("Hide Others")).toBeNull();
    expect(appItemLabel("Services")).toBeNull();
    expect(appItemLabel("About Twin Deck")).toBeNull(); // 이미 맞다
  });

  it("File 메뉴가 없으면 만들어 두 번째 자리에 넣는다", async () => {
    submenus = [new FakeSubmenu("twin-deck"), new FakeSubmenu("Edit"), new FakeSubmenu("View")];
    await installFileMenu(() => {});
    expect(calls).toEqual(["newSubmenu:File", "insert:File@1", `prepend:File:${FILE_MENU.length}`, "setAsAppMenu"]);
  });

  it("마지막이 구분선이라 기본 Close Window와 구분된다", () => {
    expect(FILE_MENU.at(-1)).toBeNull();
  });
});

describe("창별 설치", () => {
  it("설치한 뒤 창이 포커스를 얻을 때마다 다시 설치한다(마지막 창의 실행기가 남지 않게)", async () => {
    const run = vi.fn();
    const unlisten = await installFileMenuForWindow(run);
    const installs = () => calls.filter((c) => c === "setAsAppMenu").length;
    expect(installs()).toBe(1);
    focusHandlers[0]({ payload: true });
    await vi.waitFor(() => expect(installs()).toBe(2));
    focusHandlers[0]({ payload: false }); // 포커스를 잃을 때는 다시 설치하지 않는다
    await new Promise((r) => setTimeout(r, 10));
    expect(installs()).toBe(2);
    unlisten();
    expect(focusHandlers).toHaveLength(0);
  });
});
