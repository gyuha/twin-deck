import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const APP_NAME = "Twin Deck";

/**
 * 기본 앱 메뉴의 "About/Hide/Quit <앱 이름>" 항목을 `Twin Deck`으로 바꾼 글자. 바꿀 필요가 없으면 null.
 * 이 항목들의 이름은 실행 파일 이름(개발 중에는 twin-deck-desktop)에서 와서, 직접 지정하지 않으면 그 이름이 보인다.
 * "Hide Others"처럼 앱 이름이 없는 항목은 그대로 둔다.
 */
export function appItemLabel(text: string): string | null {
  const m = /^(About|Hide|Quit) (.+)$/.exec(text);
  if (!m || m[2] === "Others" || m[2] === APP_NAME) return null;
  return `${m[1]} ${APP_NAME}`;
}

/** View 메뉴 끝에 화면 요소를 켜고 끄는 체크 항목을 붙인다. View 메뉴가 없으면 File 다음 자리에 만든다. */
async function addViewToggles(menu: Menu, run: (actionId: string) => void, flags: LayoutFlags): Promise<void> {
  let view: Submenu | null = null;
  for (const item of await menu.items()) {
    if (item instanceof Submenu && (await item.text()) === "View") view = item;
  }
  if (!view) {
    view = await Submenu.new({ text: "View", items: [] });
    await menu.insert(view, 2);
  }
  await view.append(await PredefinedMenuItem.new({ item: "Separator" }));
  for (const t of VIEW_TOGGLES) {
    await view.append(await CheckMenuItem.new({ id: t.actionId, text: t.text, checked: flags[t.flag], action: () => run(t.actionId) }));
  }
}

/** 첫 번째 메뉴(앱 메뉴)의 제목과 About/Hide/Quit 항목 이름을 `Twin Deck`으로 맞춘다. */
async function renameAppMenu(menu: Menu): Promise<void> {
  const app = (await menu.items())[0];
  if (!(app instanceof Submenu)) return;
  await app.setText(APP_NAME);
  for (const item of await app.items()) {
    const label = appItemLabel(await item.text());
    if (label) await item.setText(label);
  }
}

/** 상단 메뉴바 File 메뉴에 넣는 항목. `null`은 구분선이다. 앱 안의 액션 ID로 실행한다. */
export const FILE_MENU: ({ text: string; actionId: string } | null)[] = [
  { text: "새 폴더", actionId: "core.file.new_folder" },
  { text: "새 파일", actionId: "core.file.new_file" },
  null,
  { text: "열기", actionId: "core.open" },
  { text: "편집", actionId: "core.edit" },
  { text: "파일 관리자에서 보기", actionId: "core.reveal" },
  null,
  { text: "복사", actionId: "core.copy" },
  { text: "이동", actionId: "core.move" },
  { text: "이름 변경", actionId: "core.rename" },
  { text: "다중 이름 바꾸기", actionId: "core.rename.multi" },
  { text: "압축", actionId: "core.compress" },
  { text: "압축 풀기", actionId: "core.extract" },
  null,
  { text: "휴지통으로 이동", actionId: "core.trash" },
  { text: "영구 삭제", actionId: "core.delete" },
  null,
  { text: "파일 정보", actionId: "core.file.info" },
  null,
];

/** View 메뉴에 넣는 켜고 끄는 항목. `flag`는 `LayoutFlags`의 키다. */
export const VIEW_TOGGLES = [
  { text: "드라이브 바 표시", actionId: "core.view.drive_bar", flag: "driveBar" },
  { text: "Action Bar 표시", actionId: "core.view.action_bar", flag: "actionBar" },
] as const;

/** 지금 화면 요소가 켜져 있는지. View 메뉴의 체크 표시가 이 값을 따른다. */
export interface LayoutFlags {
  driveBar: boolean;
  actionBar: boolean;
}

/**
 * 기본 앱 메뉴(앱·File·Edit·View·Window·Help)를 가져와 앱 이름을 `Twin Deck`으로 맞추고, File 메뉴의 맨 앞에 파일 항목을 끼워 넣고 앱 메뉴로 지정한다.
 * 기본 메뉴를 쓰는 이유는 Edit의 복사/붙여넣기 같은 기본 동작(입력창 단축키)을 잃지 않기 위해서다.
 * 항목에 단축키(accelerator)는 달지 않는다: 앱이 이미 키를 직접 처리하고, 메뉴가 먼저 가로채면 열려 있는 창 위에서도 실행된다.
 */
export async function installFileMenu(run: (actionId: string) => void, flags: LayoutFlags = { driveBar: true, actionBar: true }): Promise<void> {
  const menu = await Menu.default();
  let file: Submenu | null = null;
  for (const item of await menu.items()) {
    if (item instanceof Submenu && (await item.text()) === "File") file = item;
  }
  if (!file) {
    file = await Submenu.new({ text: "File", items: [] });
    await menu.insert(file, 1);
  }
  const entries = await Promise.all(
    FILE_MENU.map((e) =>
      e ? MenuItem.new({ id: e.actionId, text: e.text, action: () => run(e.actionId) }) : PredefinedMenuItem.new({ item: "Separator" }),
    ),
  );
  await file.prepend(entries);
  await addViewToggles(menu, run, flags);
  await renameAppMenu(menu);
  await menu.setAsAppMenu();
}

/**
 * 이 창의 파일 메뉴를 설치하고, 창이 포커스를 얻을 때마다 다시 설치한다.
 * macOS 메뉴바는 앱 전체에서 하나라서, 창을 여럿 열면(win-N) 마지막에 설치한 창의 실행기가 남는다.
 * 포커스를 얻을 때 다시 설치해야 메뉴가 항상 지금 보이는 창에 작용한다. 반환값은 포커스 감시 해제 함수다.
 */
export async function installFileMenuForWindow(run: (actionId: string) => void, flags?: LayoutFlags): Promise<() => void> {
  await installFileMenu(run, flags);
  return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) void installFileMenu(run, flags);
  });
}
