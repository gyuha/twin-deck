/**
 * Rust가 만들어 화면까지 오는 한국어 문구의 영어 대응표(이슈 #32).
 * Rust는 오류를 문자열로 돌려주므로, 영어일 때 이 표로 문구를 바꾼다. 모르는 문구는 그대로(한국어) 보인다.
 * `{}`·`{이름}`·`{0}` 자리표시자는 같은 순서로 영어 문구에 옮겨진다.
 * 모든 한국어 문자열 리터럴이 이 표나 `RUST_INTERNAL`(개발자용 진단·조각)에 있는지는 `i18n-rust-messages.test.ts`가 소스를 읽어 확인한다.
 */
export const RUST_MESSAGES: readonly (readonly [ko: string, en: string])[] = [
  ["설정 디렉터리를 사용할 수 없습니다", "The settings directory is unavailable"],
  ["설정 디렉터리를 사용할 수 없어 상태를 저장/복원하지 못합니다", "The settings directory is unavailable, so the state cannot be saved or restored"],
  ["끌어 갈 파일이 없습니다", "There are no files to drag"],
  ["이 운영체제에서는 파일을 다른 앱으로 끌어 갈 수 없습니다", "Files cannot be dragged to other apps on this operating system"],
  ["설치할 새 버전이 없습니다", "There is no new version to install"],
  ["설정 디렉터리를 열지 못해 기본값을 씁니다: {e}", "Could not open the settings directory, using defaults: {e}"],
  ["설정 디렉터리를 알 수 없어 기본값을 씁니다", "The settings directory is unknown, using defaults"],
  ["처리기 {clsid}, 영역 {}×{} 위치 ({}, {})", "handler {clsid}, area {}×{} at ({}, {})"],
  ["미리보기 호스트가 잠겨 있습니다", "The preview host is locked"],
  ["{path}: 파일이 아닙니다", "{path}: not a file"],
  ["{path}: 차단을 해제하지 못했습니다: {e}", "{path}: could not unblock: {e}"],
  ["미리보기 처리기를 띄우지 못했습니다", "Could not start the preview handler"],
  ["처리기 ID가 잘못됐습니다: {e}", "Invalid handler ID: {e}"],
  ["미리보기 창을 연결하지 못했습니다: {e}", "Could not attach the preview window: {e}"],
  ["문서를 그리지 못했습니다: {e}", "Could not render the document: {e}"],
  ["문서를 열지 못했습니다: {e}", "Could not open the document: {e}"],
  ["이 처리기는 지원하지 않는 초기화 방식입니다", "This handler uses an unsupported initialization method"],
  ["미리보기 창을 만들지 못했습니다: {e}", "Could not create the preview window: {e}"],
  ["미리보기 호스트를 시작하지 못했습니다", "Could not start the preview host"],
  ["미리보기 처리기가 시간 안에 문서를 그리지 못했습니다", "The preview handler did not render the document in time"],
  ["Quick Look으로 미리 볼 수 없습니다", "Cannot preview with Quick Look"],
  ["취소되었습니다", "Cancelled"],
  ["파일을 찾을 수 없습니다: {}", "File not found: {}"],
  ["(시간 초과)", "(timed out)"],
  ["(빈 폴더)", "(empty folder)"],
  ["(빈 압축 파일)", "(empty archive)"],
  ["폴더가 아닙니다: {path}", "Not a folder: {path}"],
  ["압축할 항목이 없습니다", "There are no items to compress"],
  ["{path}: 쓸 위치를 알 수 없습니다", "{path}: cannot determine where to write"],
  ["이 OS에서는 지원하지 않습니다", "Not supported on this OS"],
  ["epub 파일이 너무 커서(100MB 초과) 미리 볼 수 없습니다", "The epub file is too large (over 100 MB) to preview"],
  ["epub(ZIP) 파일이 아닙니다", "Not an epub (ZIP) file"],
  ["암호화(DRM)된 epub은 미리 볼 수 없습니다", "An encrypted (DRM) epub cannot be previewed"],
  ["epub의 container.xml이 없습니다", "The epub has no container.xml"],
  ["epub의 container.xml을 읽지 못했습니다", "Could not read the epub's container.xml"],
  ["epub의 패키지 문서(OPF)를 찾지 못했습니다", "Could not find the epub's package document (OPF)"],
  ["epub의 패키지 문서(OPF)를 읽지 못했습니다", "Could not read the epub's package document (OPF)"],
  ["epub에 읽을 수 있는 챕터가 없습니다", "The epub has no readable chapters"],
  ["챕터 번호가 범위를 벗어났습니다", "The chapter number is out of range"],
  ["챕터가 너무 커서(2MB 초과) 미리 볼 수 없습니다", "The chapter is too large (over 2 MB) to preview"],
  ["압축 파일 안의 epub은 미리 볼 수 없습니다", "An epub inside an archive cannot be previewed"],
  ["챕터 {n}", "Chapter {n}"],
  ["압축 파일 안의 문서는 Quick Look으로 볼 수 없습니다", "Documents inside an archive cannot be viewed with Quick Look"],
  ["널 문자가 든 이름", "name containing a NUL character"],
  ["절대 경로", "absolute path"],
  ["드라이브 경로", "drive path"],
  ["상위 경로(..)를 포함", "contains a parent path (..)"],
  ["{path} (폴더)", "{path} (folder)"],
  ["심볼릭 링크 또는 특수 파일", "symbolic link or special file"],
  ["아카이브로 열 수 있는 형식이 아닙니다", "This is not a format that can be opened as an archive"],
  ["아카이브 자체는 만들 수 없습니다", "The archive itself cannot be created"],
  ["아카이브 자체는 옮길 수 없습니다", "The archive itself cannot be moved"],
  ["아카이브 자체는 덮어쓸 수 없습니다", "The archive itself cannot be overwritten"],
  ["아카이브 자체는 지울 수 없습니다", "The archive itself cannot be deleted"],
  ["아카이브 안의 심볼릭 링크는 지원하지 않습니다", "Symbolic links inside an archive are not supported"],
  ["아카이브 안에는 심볼릭 링크를 만들 수 없습니다", "Cannot create a symbolic link inside an archive"],
  ["같은 이름의 항목이 둘 이상입니다: {name}", "More than one item has the same name: {name}"],
  ["파일만 편집기로 열 수 있습니다", "Only files can be opened in an editor"],
  ["입출력 오류: {0}", "I/O error: {0}"],
  ["아카이브 형식 오류: {0}", "Archive format error: {0}"],
  ["아카이브 안에 없음: {0}", "Not found in the archive: {0}"],
  ["안전하지 않은 항목이라 추출하지 않았습니다: {name} ({reason})", "Not extracted because the item is unsafe: {name} ({reason})"],
  ["읽기 전용 아카이브입니다: {0}", "This archive is read-only: {0}"],
  ["이미 있어서 덮어쓰지 않았습니다: {0}", "Not overwritten because it already exists: {0}"],
  ["지원하지 않는 형식입니다: {0}", "Unsupported format: {0}"],
  ["작업이 중단되었습니다", "The operation was aborted"],
  ["컬럼 너비가 숫자가 아닙니다: '{w}'", "The column width is not a number: '{w}'"],
  ["컬럼 너비는 1 이상이어야 합니다", "The column width must be at least 1"],
  ["알 수 없는 컬럼 이름: '{name}'", "Unknown column name: '{name}'"],
  ["{key}: 인라인 테이블에는 문자열 id가 필요합니다", "{key}: an inline table needs a string id"],
  ["{key}: 인수 {k}는 문자열/숫자/불리언이어야 합니다", "{key}: argument {k} must be a string, number, or boolean"],
  ["{key}: 문자열 또는 인라인 테이블이어야 합니다", "{key}: must be a string or an inline table"],
  ["알 수 없는 키를 무시합니다: {k}", "Ignoring unknown key: {k}"],
  ["keybindings는 테이블이어야 합니다", "keybindings must be a table"],
  ["TOML 문법 오류: {}", "TOML syntax error: {}"],
  ["{section}.{key}: '{v}'는 허용되지 않는 값입니다 ({}{})", "{section}.{key}: '{v}' is not an allowed value ({}{})"],
  [" 또는 테마 이름(apps/desktop/themes의 파일 이름, 예: catppuccin-mocha)", " or a theme name (file name in apps/desktop/themes, e.g. catppuccin-mocha)"],
  ["behavior.text_color: '{v}'는 색이 아닙니다 (#rrggbb 또는 #rgb, 비우면 테마 그대로)", "behavior.text_color: '{v}' is not a color (#rrggbb or #rgb; empty keeps the theme)"],
  ["테이블이어야 합니다", "must be a table"],
  ["name과 path가 필요합니다", "name and path are required"],
  ["그룹에는 name이 필요합니다", "A group needs a name"],
  ["그룹 항목에는 name과 path가 필요합니다 (그룹 중첩은 한 단계까지)", "A group item needs name and path (groups can nest only one level)"],
  ["알 수 없는 type: {other}", "Unknown type: {other}"],
  ["설정을 해석하지 못해 기본값을 씁니다: {e}", "Could not parse the settings, using defaults: {e}"],
  ["알 수 없는 키를 무시합니다: {here}", "Ignoring unknown key: {here}"],
  ["{here}: 문자열 배열이어야 합니다", "{here}: must be an array of strings"],
  ["{here}: {}이어야 하는데 {}입니다", "{here}: expected {} but got {}"],
  ["TOML 문법 오류", "TOML syntax error"],
  ["config.toml을 읽지 못했습니다: {e}", "Could not read config.toml: {e}"],
  ["config.toml에 문법 오류가 있어 설정을 바꾸지 않았습니다", "config.toml has a syntax error, so the setting was not changed"],
  ["빈 키입니다", "The key is empty"],
  ["{key}: {t}이(가) 테이블이 아닙니다", "{key}: {t} is not a table"],
  ["config.toml에 문법 오류가 있어 즐겨찾기를 추가하지 않았습니다", "config.toml has a syntax error, so the favorite was not added"],
  ["favorites가 이미 다른 형식으로 정의되어 있어 추가하지 못했습니다", "favorites is already defined in another form, so it could not be added"],
  ["환경 설정 [environment] text_editor가 비어 있습니다", "The [environment] text_editor setting is empty"],
  ["열 항목이 없습니다", "There are no items to open"],
  ["애플리케이션 값의 따옴표가 닫히지 않았습니다", "A quote in the application value is not closed"],
  ["애플리케이션이 지정되지 않았습니다", "No application is specified"],
  ["전달할 항목이 없습니다", "There are no items to pass"],
  ["{program} 실행 실패: {e}", "Failed to run {program}: {e}"],
  ["{program}가 종료 코드 {c}로 끝났습니다", "{program} exited with code {c}"],
  ["{program}가 신호로 끝났습니다", "{program} ended with a signal"],
  ["대상이 원본 자신이거나 그 하위입니다: {0}", "The destination is the source itself or inside it: {0}"],
  ["같은 파일을 덮어쓸 수 없습니다: {0}", "Cannot overwrite the same file: {0}"],
  ["잘못된 이름: {0}", "Invalid name: {0}"],
  ["휴지통 이동 실패: {0}", "Failed to move to the trash: {0}"],
  ["{0}개 항목을 복사하지 못해 원본을 지우지 않았습니다", "{0} items could not be copied, so the originals were not deleted"],
  ["{name} 추출", "Extract {name}"],
  ["{path}: 아카이브 안에서는 휴지통을 쓸 수 없습니다 (영구 삭제만 가능)", "{path}: the trash is not available inside an archive (only permanent delete)"],
  ["찾을 텍스트가 비었습니다", "The text to find is empty"],
  ["텍스트 정규식 오류: {e}", "Text regular expression error: {e}"],
  ["파일 마스크 정규식 오류: {e}", "File mask regular expression error: {e}"],
  ["{}개 파일은 바이너리이거나 16MB를 넘어 내용을 보지 않았습니다", "{} files were not searched because they are binary or larger than 16MB"],
  ["{} (위치 {})", "{} (position {})"],
  ["{what}: 이 백엔드(라이브 순회)에서 지원하지 않습니다", "{what}: not supported by this backend (live traversal)"],
  ["따옴표가 닫히지 않았습니다", "A quote is not closed"],
  ["질의가 비었습니다", "The query is empty"],
  ["AND 앞뒤에는 조건이 있어야 합니다", "AND needs a condition on both sides"],
  ["`{}` 뒤에 인수가 없습니다", "There is no argument after `{}`"],
  ["이름에는 크기 비교 연산자(<, >)를 쓸 수 없습니다", "Size comparison operators (<, >) cannot be used with Name"],
  ["내용에는 크기 비교 연산자(<, >)를 쓸 수 없습니다", "Size comparison operators (<, >) cannot be used with Content"],
  ["Size에는 =, !=, <, <=, >, >=만 쓸 수 있습니다", "Size accepts only =, !=, <, <=, >, >="],
  ["크기를 읽을 수 없습니다: {arg} (예: 500, 10KB, 1.5MB)", "Cannot read the size: {arg} (e.g. 500, 10KB, 1.5MB)"],
  ["Kind에는 is, isNot(=, !=)만 쓸 수 있습니다", "Kind accepts only is, isNot (=, !=)"],
  ["알 수 없는 종류입니다: {arg}", "Unknown kind: {arg}"],
  ["날짜에는 =, !=, <, <=, >, >=만 쓸 수 있습니다", "Dates accept only =, !=, <, <=, >, >="],
  ["날짜를 읽을 수 없습니다: {arg} (예: 2026-09-01, 2026-09-01 10:30, today, 7d)", "Cannot read the date: {arg} (e.g. 2026-09-01, 2026-09-01 10:30, today, 7d)"],
  ["{name} 패널에 탭이 없습니다", "The {name} pane has no tabs"],
  ["{name} 패널의 활성 탭 번호가 범위를 벗어났습니다", "The active tab index of the {name} pane is out of range"],
  ["패널 분할 비율이 범위를 벗어났습니다: {}", "The pane split ratio is out of range: {}"],
  ["알 수 없는 활성 패널: {}", "Unknown active pane: {}"],
  ["{}을 읽지 못했습니다: {e}", "Could not read {}: {e}"],
  ["{}을 무시합니다: {why}", "Ignoring {}: {why}"],
  ["저장 형식 버전이 다릅니다({} != {VERSION})", "The save format version differs ({} != {VERSION})"],
  ["찾을 수 없음: {0}", "Not found: {0}"],
  ["이미 존재함: {0}", "Already exists: {0}"],
  ["심볼릭 링크를 만들 권한이 없습니다. Windows에서는 설정에서 개발자 모드를 켜거나 관리자 권한으로 실행해야 합니다", "You do not have permission to create symbolic links. On Windows, turn on Developer Mode in Settings or run as administrator"],
  ["접근이 거부되었습니다. 대상 폴더의 쓰기 권한을 확인하세요 (Windows에서는 개발자 모드나 관리자 권한도 필요할 수 있습니다)", "Access denied. Check write permission on the destination folder (on Windows, Developer Mode or administrator rights may also be required)"],
  ["이 파일시스템은 심볼릭 링크를 지원하지 않습니다 (FAT/exFAT 볼륨 등)", "This file system does not support symbolic links (e.g. FAT/exFAT volumes)"],
  ["같은 이름이 이미 있습니다", "An item with the same name already exists"],
  ["대상 폴더를 찾을 수 없습니다", "The destination folder was not found"],
  ["링크를 만들 수 없는 위치이거나 잘못된 경로입니다", "A link cannot be created here, or the path is invalid"],
  ["링크를 만들 권한이 없습니다. 대상 폴더의 쓰기 권한을 확인하세요", "You do not have permission to create the link. Check write permission on the destination folder"],
  ["읽기 전용 볼륨이라 링크를 만들 수 없습니다", "The volume is read-only, so the link cannot be created"],
  ["이름이 너무 깁니다", "The name is too long"],
  ["{path}: 경로에 NUL 문자가 있습니다", "{path}: the path contains a NUL character"],
  ["이 OS에서는 용량 조회를 지원하지 않습니다", "Querying capacity is not supported on this OS"],
  ["마운트된 볼륨이 아닙니다: {0}", "Not a mounted volume: {0}"],
  ["루트 볼륨은 언마운트할 수 없습니다", "The root volume cannot be unmounted"],
  ["이동식/네트워크 드라이브가 아니라서 꺼낼 수 없습니다: {0}", "Cannot eject because this is not a removable/network drive: {0}"],
  ["명령 실행 실패: {0}", "Command failed: {0}"],
  ["{mount_point}: 아직 사용 중이어서 꺼내지 못했습니다. 열려 있는 파일이나 창을 닫고 다시 시도하세요", "{mount_point}: could not eject because it is still in use. Close open files or windows and try again"],
  ["감시 실패: {0}", "Watch failed: {0}"],
  ["터미널 세션 {0}번이 없습니다", "There is no terminal session {0}"],
  ["경로를 찾을 수 없습니다: {p}", "Path not found: {p}"],
  ["다른 td가 이미 있어 덮어쓰지 않습니다: {}", "Another td already exists, not overwriting it: {}"],
  ["링크를 만들지 못했습니다: {}", "Could not create the link: {}"],
  ["링크를 만들지 못했습니다: {e}", "Could not create the link: {e}"],
  ["다른 td라서 지우지 않습니다: {}", "Not removing it because it is another td: {}"],
  ["링크를 지우지 못했습니다: {}", "Could not remove the link: {}"],
  ["링크를 지우지 못했습니다: {e}", "Could not remove the link: {e}"],
  ["osascript를 실행하지 못했습니다: {e}", "Could not run osascript: {e}"],
  ["관리자 암호 입력을 취소했습니다", "The administrator password prompt was cancelled"],
  ["관리자 권한 실행에 실패했습니다: {}", "Running with administrator privileges failed: {}"],
  ["이 운영체제에서는 명령줄 도구 설치를 지원하지 않습니다", "Installing the command line tool is not supported on this operating system"],
  ["앱 폴더를 알 수 없습니다", "The app folder is unknown"],
  ["레지스트리를 열지 못했습니다: {}", "Could not open the registry: {}"],
  ["사용자 PATH를 읽지 못했습니다: {}", "Could not read the user PATH: {}"],
  ["사용자 PATH를 쓰지 못했습니다: {}", "Could not write the user PATH: {}"],
  ["실행 파일 이름을 알 수 없습니다", "The executable name is unknown"],
  ["td.cmd를 쓰지 못했습니다: {e}", "Could not write td.cmd: {e}"],
  ["앱 실행 파일 위치를 알 수 없습니다: {e}", "The app executable location is unknown: {e}"],
  ["사용법: td [폴더 [폴더]]  (첫 폴더는 왼쪽 패널, 둘째는 오른쪽 패널에 새 탭으로 엽니다)", "Usage: td [folder [folder]]  (the first folder opens in the left pane, the second in the right pane, each as a new tab)"],
  ["경로를 확인할 수 없음 {path}: {source}", "Cannot check the path {path}: {source}"],
];

/** 사용자에게 그대로 보이지 않는 한국어 리터럴: 개발자용 진단·테스트 확인 문구, 더 큰 문구를 이루는 조각. 한국어로 둔다. */
export const RUST_INTERNAL: readonly string[] = [
  "td: 앱 실행 파일 위치를 알 수 없습니다: {e}",
  "경로는 최대 2개입니다: {}개",
  "지원하지 않는 옵션: {opt}",
  "td: 실행 파일 위치를 알 수 없습니다: {e}",
  "td: Twin Deck을 실행하지 못했습니다: {e}",
  "서비스 초기화 실패",
  "twin-deck 실행 중 오류가 발생했습니다",
  "capabilities 디렉터리가 없다",
  "permissions 배열",
  "문자열 권한",
  "core:default 권한이 없다",
  "플러그인 tauri-plugin-{name}의 권한({prefix}…)이 capability에 없다",
  "windows 배열",
  "main 창이 capability에 없다: {patterns:?}",
  "새 창 레이블 {label}이 capability windows {patterns:?}에 없다",
  "프로세스 밖",
  "프로세스 안",
  "{CANT} (시간 초과)",
  "위에서 검사함",
  "아카이브 자체는 {what} 수 없습니다",
  "만들",
  "옮길",
  "덮어쓸",
  "지울",
  "내장 기본값 default.toml이 올바른 TOML이 아니다",
  "내장 기본값이 Config 스키마와 맞지 않는다",
  "섹션",
  "문자열",
  "숫자",
  "불리언",
  "날짜",
  "배열",
  "테이블",
  "무한 반복자",
  "진행 읽기 스레드",
  "복사에는 대상 폴더가 필요하다",
  "이동에는 대상 폴더가 필요하다",
  "압축에는 대상 폴더가 필요하다",
  "추출에는 대상 폴더가 필요하다",
  "plain 또는 regex 중 하나",
  "{var}에는 크기 비교 연산자(<, >)를 쓸 수 없습니다",
  "이름",
  "내용",
  "크기",
  "수정일",
  "생성일",
  "종류",
  "조회할 수 없으면 숨기지 않는다",
];

const PLACEHOLDER = /\{[^{}]*\}/g;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Entry {
  re: RegExp;
  names: string[];
  en: string;
}

const compiled: Entry[] = [...RUST_MESSAGES]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([ko, en]) => {
    const names: string[] = [];
    let source = "";
    let last = 0;
    for (const m of ko.matchAll(PLACEHOLDER)) {
      source += escapeRegExp(ko.slice(last, m.index)) + "([\\s\\S]+?)";
      names.push(m[0]);
      last = m.index + m[0].length;
    }
    source += escapeRegExp(ko.slice(last));
    return { re: new RegExp(source, "g"), names, en };
  });

/** 메시지 속 한국어 문구를 영어로 바꾼다. 문구가 다른 문구를 품고 있으면(오류 안의 오류) 몇 번 더 바꾼다. */
export function translateRust(message: string): string {
  let out = message;
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const e of compiled) {
      out = out.replace(e.re, (...args: unknown[]) => {
        const groups = args.slice(1, 1 + e.names.length) as string[];
        const byName = new Map<string, string>();
        let anon = 0;
        e.names.forEach((n, i) => (n === "{}" ? undefined : byName.set(n, groups[i])));
        const anonValues = e.names.flatMap((n, i) => (n === "{}" ? [groups[i]] : []));
        return e.en.replace(PLACEHOLDER, (p) => (p === "{}" ? (anonValues[anon++] ?? p) : (byName.get(p) ?? p)));
      });
    }
    if (out === before) break;
  }
  return out;
}
