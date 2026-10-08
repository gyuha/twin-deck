import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t as translate } from "./i18n";
import type { Key } from "./i18n";

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

/** 액션 ID의 현재 키를 화면에 보일 글자(예: `Cmd+Shift+D`)로 돌려주는 함수. 키가 없으면 undefined. */
export type KeyOf = (actionId: string) => string | undefined;

/** 메뉴 항목 글자 뒤에 키를 괄호로 붙인다. 네이티브 accelerator는 쓰지 않는다(아래 `installFileMenu` 설명). */
const withKey = (text: string, key: string | undefined) => (key ? `${text} (${key})` : text);

/** View 메뉴 끝에 화면 요소를 켜고 끄는 체크 항목을 붙인다. View 메뉴가 없으면 File 다음 자리에 만든다. */
async function addViewToggles(menu: Menu, run: (actionId: string) => void, flags: LayoutFlags, keyOf?: KeyOf): Promise<void> {
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
    await view.append(await CheckMenuItem.new({ id: t.actionId, text: withKey(translate(t.key), keyOf?.(t.actionId)), checked: flags[t.flag], action: () => run(t.actionId) }));
  }
}

/** 설정 화면과 단축키 목록(도움말 화면)을 여는 메뉴 항목. 앱 메뉴와 Help 메뉴에 한 줄씩 넣는다(이슈 #40). */
async function addEntryItems(menu: Menu, run: (actionId: string) => void, keyOf?: KeyOf): Promise<void> {
  const item = (text: string, actionId: string) => MenuItem.new({ id: actionId, text: withKey(text, keyOf?.(actionId)), action: () => run(actionId) });
  const items = await menu.items();
  const app = items[0];
  if (app instanceof Submenu) {
    // 기본 앱 메뉴는 `About, 구분선, Services…` 순서라, 첫 구분선 뒤에 항목과 구분선을 끼운다.
    await app.insert(await item(translate("menu.settings"), "core.settings.open"), 2);
    await app.insert(await PredefinedMenuItem.new({ item: "Separator" }), 3);
  }
  let help: Submenu | null = null;
  for (const it of items) {
    if (it instanceof Submenu && (await it.text()) === "Help") help = it;
  }
  if (!help) {
    help = await Submenu.new({ text: "Help", items: [] });
    await menu.append(help);
  }
  await help.append(await item(translate("menu.help_shortcuts"), "core.help"));
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
export const FILE_MENU: ({ key: Key; actionId: string } | null)[] = [
  { key: "menu.file.new_folder", actionId: "core.file.new_folder" },
  { key: "menu.file.new_file", actionId: "core.file.new_file" },
  null,
  { key: "menu.file.open", actionId: "core.open" },
  { key: "menu.file.edit", actionId: "core.edit" },
  { key: "menu.file.reveal", actionId: "core.reveal" },
  null,
  { key: "menu.file.copy", actionId: "core.copy" },
  { key: "menu.file.move", actionId: "core.move" },
  { key: "menu.file.rename", actionId: "core.rename" },
  { key: "menu.file.rename_multi", actionId: "core.rename.multi" },
  { key: "menu.file.compress", actionId: "core.compress" },
  { key: "menu.file.extract", actionId: "core.extract" },
  null,
  { key: "menu.file.trash", actionId: "core.trash" },
  { key: "menu.file.delete", actionId: "core.delete" },
  null,
  { key: "menu.file.info", actionId: "core.file.info" },
  null,
];

/** View 메뉴에 넣는 켜고 끄는 항목. `flag`는 `LayoutFlags`의 키다. */
export const VIEW_TOGGLES = [
  { key: "menu.view.drive_bar", actionId: "core.view.drive_bar", flag: "driveBar" },
  { key: "menu.view.action_bar", actionId: "core.view.action_bar", flag: "actionBar" },
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
export async function installFileMenu(
  run: (actionId: string) => void,
  flags: LayoutFlags = { driveBar: true, actionBar: true },
  keyOf?: KeyOf,
): Promise<void> {
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
      e ? MenuItem.new({ id: e.actionId, text: withKey(translate(e.key), keyOf?.(e.actionId)), action: () => run(e.actionId) }) : PredefinedMenuItem.new({ item: "Separator" }),
    ),
  );
  await file.prepend(entries);
  await addViewToggles(menu, run, flags, keyOf);
  await addEntryItems(menu, run, keyOf);
  await renameAppMenu(menu);
  await menu.setAsAppMenu();
}

/**
 * 이 창의 파일 메뉴를 설치하고, 창이 포커스를 얻을 때마다 다시 설치한다.
 * macOS 메뉴바는 앱 전체에서 하나라서, 창을 여럿 열면(win-N) 마지막에 설치한 창의 실행기가 남는다.
 * 포커스를 얻을 때 다시 설치해야 메뉴가 항상 지금 보이는 창에 작용한다. 반환값은 포커스 감시 해제 함수다.
 */
export async function installFileMenuForWindow(run: (actionId: string) => void, flags?: LayoutFlags, keyOf?: KeyOf): Promise<() => void> {
  await installFileMenu(run, flags, keyOf);
  return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) void installFileMenu(run, flags, keyOf);
  });
}
