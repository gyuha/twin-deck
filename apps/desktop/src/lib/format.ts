import { t as translate } from "../i18n";
import type { Config, EntryDto } from "@twin-deck/ts-client";
import type { ColumnName } from "./columns";
import { extensionOf } from "./sort";

const SI = ["B", "KB", "MB", "GB", "TB"];
const IEC = ["B", "KiB", "MiB", "GiB", "TiB"];

function scale(bytes: number, base: number, units: string[], unit?: string): string {
  if (unit) {
    const k = units.indexOf(unit);
    return k <= 0 ? `${bytes} B` : `${(bytes / base ** k).toFixed(1)} ${unit}`;
  }
  let n = bytes;
  let k = 0;
  while (n >= base && k < units.length - 1) {
    n /= base;
    k++;
  }
  return k === 0 ? `${bytes} B` : `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[k]}`;
}

/** `display.size_format`: adaptive | adaptive_kibi | bytes | KB.. | KiB.. */
export function formatSize(bytes: number, format: string): string {
  if (format === "bytes") return `${bytes} B`;
  if (format === "adaptive_kibi") return scale(bytes, 1024, IEC);
  if (IEC.includes(format)) return scale(bytes, 1024, IEC, format);
  if (SI.includes(format) && format !== "adaptive") return scale(bytes, 1000, SI, format);
  return scale(bytes, 1000, SI);
}

/** 볼륨의 남은/전체 용량 표기. `formatSize`와 같은 단위 선택이지만 항상 소수 한 자리다(`73.8 GB`). */
export function formatSpace(bytes: number, format: string): string {
  if (format === "bytes") return `${bytes} B`;
  const kibi = format === "adaptive_kibi" || IEC.includes(format);
  const base = kibi ? 1024 : 1000;
  const units = kibi ? IEC : SI;
  const fixed = units.indexOf(format);
  if (fixed > 0) return `${(bytes / base ** fixed).toFixed(1)} ${format}`;
  let n = bytes;
  let k = 0;
  while (n >= base && k < units.length - 1) {
    n /= base;
    k++;
  }
  return k === 0 ? `${bytes} B` : `${n.toFixed(1)} ${units[k]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** strftime 부분집합: %Y %y %m %d %e %H %I %M %S %p %b %B %a %A %j %%, 그리고 `%-d`처럼 0 채움을 없애는 `-` 플래그. */
export function strftime(format: string, d: Date): string {
  return format.replace(/%(-?)([a-zA-Z%])/g, (whole, flag: string, c: string) => {
    const pad = (n: number, w = 2) => (flag ? String(n) : String(n).padStart(w, "0"));
    switch (c) {
      case "Y":
        return String(d.getFullYear());
      case "y":
        return pad(d.getFullYear() % 100);
      case "m":
        return pad(d.getMonth() + 1);
      case "d":
        return pad(d.getDate());
      case "e":
        return String(d.getDate()).padStart(2, " ");
      case "H":
        return pad(d.getHours());
      case "I":
        return pad(d.getHours() % 12 || 12);
      case "M":
        return pad(d.getMinutes());
      case "S":
        return pad(d.getSeconds());
      case "p":
        return d.getHours() < 12 ? "AM" : "PM";
      case "b":
        return MONTHS[d.getMonth()];
      case "B":
        return MONTH_LONG[d.getMonth()];
      case "a":
        return DAYS[d.getDay()];
      case "A":
        return DAY_LONG[d.getDay()];
      case "j": {
        const start = new Date(d.getFullYear(), 0, 0).getTime();
        return pad(Math.floor((d.getTime() - start) / 86_400_000), 3);
      }
      case "%":
        return "%";
      default:
        return whole;
    }
  });
}

type Display = Config["display"];

/** 날짜 컬럼. `relative_date`가 켜져 있으면 오늘/어제는 상대 표기. */
export function formatDate(ms: number | null, display: Display, now = Date.now()): string {
  if (ms === null) return "";
  const d = new Date(ms);
  if (display.relative_date) {
    const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);
    const diffDays = Math.round((dayStart(now) - dayStart(ms)) / 86_400_000);
    if (diffDays === 0) return translate("format.today", { time: strftime(display.time_format, d) });
    if (diffDays === 1) return translate("format.yesterday", { time: strftime(display.time_format, d) });
  }
  return strftime(display.date_format, d);
}

/** 상대 표기 없이 날짜와 시각을 모두 보여 주는 형식 (파일 정보용). */
export function formatDateTime(ms: number | null, display: Display): string {
  return ms === null ? "—" : strftime(`${display.date_format} ${display.time_format}`, new Date(ms));
}

/** 권한 비트를 `rwxr-xr-x`로. */
export function formatPermissions(mode: number | null): string {
  if (mode === null) return "";
  const bits = "rwxrwxrwx";
  return [...bits].map((c, i) => (mode & (1 << (8 - i)) ? c : "-")).join("");
}

export function formatOctal(mode: number | null): string {
  return mode === null ? "" : (mode & 0o777).toString(8).padStart(3, "0");
}

export const COLUMN_TITLES: Record<ColumnName, string> = {
  get name() { return translate("column.name"); },
  get size() { return translate("column.size"); },
  get created() { return translate("column.created"); },
  get modified() { return translate("column.modified"); },
  get added() { return translate("column.added"); },
  get extension() { return translate("column.extension"); },
  get permissions() { return translate("column.permissions"); },
  get permissions_octal() { return translate("column.permissions_octal"); },
};

/** 한 셀의 표시 문자열. */
/** `dirSize`: 폴더에도 크기를 보여 준다(Disk Usage 결과는 폴더의 총 크기를 담고 있다). `folderBytes`: 그 폴더의 계산한 하위 용량(null은 계산 중). */
export function cellText(e: EntryDto, column: ColumnName, display: Display, now?: number, dirSize = false, folderBytes?: number | null): string {
  switch (column) {
    case "name":
      return e.name;
    case "size":
      // `folderBytes`: 선택해서 계산한 폴더 하위 용량. 계산 전(undefined)이면 비우고, 계산 중(null)이면 `…`이다.
      if (e.kind === "dir" && !dirSize) return folderBytes === undefined ? "" : folderBytes === null ? "…" : formatSize(folderBytes, display.size_format);
      return formatSize(e.size, display.size_format);
    case "created":
      return formatDate(e.createdMs, display, now);
    case "modified":
      return formatDate(e.modifiedMs, display, now);
    case "added":
      return "—"; // 파일시스템에서 얻을 수 없다(macOS 'Date Added'는 Spotlight 메타데이터)
    case "extension":
      return e.kind === "dir" ? "" : extensionOf(e.name);
    case "permissions":
      return formatPermissions(e.mode);
    case "permissions_octal":
      return formatOctal(e.mode);
  }
}
