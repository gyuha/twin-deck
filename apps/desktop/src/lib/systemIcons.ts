import { useEffect, useState } from "react";
import { isArchivePath } from "@twin-deck/ts-client";

/** 시스템 아이콘을 얻는 쪽(스토어의 `api`). */
export interface IconSource {
  systemIcon(path: string, isDir: boolean, size: number): Promise<string | null>;
}

export interface IconRequest {
  path: string;
  name: string;
  isDir: boolean;
  /** 화면에 그리는 한 변(CSS 픽셀). */
  size: number;
}

/** 이름·경로가 자기 아이콘을 가지는 파일 확장자. 서비스의 `icon_source`(src-tauri/src/service.rs)와 같은 규칙이며, 한쪽을 바꾸면 다른 쪽도 맞춘다. */
const OWN_ICON_EXTS = new Set(["exe", "lnk", "ico", "scr", "cur"]);

/**
 * 같은 아이콘이 나오는 항목끼리 같은 키를 갖게 한다(서비스의 `icon_source`와 같은 규칙).
 * 폴더는 `dir`(디스크 위 `.app`은 경로), 파일은 소문자 확장자(자기 아이콘을 가진 `exe`·`lnk` 같은 것은 경로)다. 압축 안은 늘 확장자·`dir`이다.
 */
export function iconKey(req: Pick<IconRequest, "path" | "name" | "isDir">): string {
  const archived = isArchivePath(req.path);
  const lower = req.name.toLowerCase();
  if (req.isDir) return !archived && lower.endsWith(".app") ? `path:${req.path}` : "dir";
  const i = lower.lastIndexOf(".");
  const ext = i > 0 ? lower.slice(i + 1) : "";
  return !archived && OWN_ICON_EXTS.has(ext) ? `path:${req.path}` : `ext:${ext}`;
}

const SIZES = [16, 32, 64, 128];

/** 화면 크기(CSS px)와 화면 배율에 맞는 요청 크기: 필요한 픽셀 수를 16·32·64·128 중 올림한다. */
export function iconPixels(size: number, dpr = 1): number {
  const need = Math.ceil(size * (dpr > 0 ? dpr : 1));
  return SIZES.find((s) => s >= need) ?? SIZES[SIZES.length - 1];
}

interface Entry {
  promise: Promise<string | null>;
  /** 끝났으면 결과(null은 "얻지 못함"). 화면에 새로 나타난 행이 깜빡임 없이 바로 쓴다. */
  done?: { url: string | null };
}

// 얻는 쪽(스토어 api)별 캐시. 아이콘은 바뀌지 않으므로 거부·null도 그대로 둔다(같은 항목을 계속 다시 묻지 않는다).
const caches = new WeakMap<IconSource, Map<string, Entry>>();
/** 캐시가 이만큼 커지면 비운다(경로 키가 쌓이지 않게). */
const CACHE_MAX = 1024;

function entryFor(source: IconSource, req: IconRequest): { key: string; entry: Entry } {
  const px = iconPixels(req.size, typeof window === "undefined" ? 1 : window.devicePixelRatio);
  const key = `${iconKey(req)}@${px}`;
  let cache = caches.get(source);
  if (!cache) caches.set(source, (cache = new Map()));
  let entry = cache.get(key);
  if (!entry) {
    if (cache.size >= CACHE_MAX) cache.clear();
    const e: Entry = { promise: Promise.resolve(null) };
    e.promise = source.systemIcon(req.path, req.isDir, px).then(
      (url) => (e.done = { url }).url,
      () => (e.done = { url: null }).url,
    );
    cache.set(key, (entry = e));
  }
  return { key, entry };
}

/**
 * 항목의 시스템 아이콘 주소. `req`가 null이면(옵션이 꺼짐) 요청하지 않고 null이다.
 * 응답이 오기 전·얻지 못했을 때도 null이다 — 부르는 쪽이 기본 아이콘을 그대로 둔다.
 */
export function useSystemIcon(source: IconSource, req: IconRequest | null): string | null {
  const resolved = req ? entryFor(source, req) : null;
  const [fetched, setFetched] = useState<{ key: string; url: string | null } | null>(null);
  const key = resolved?.key ?? null;
  const entry = resolved?.entry ?? null;
  useEffect(() => {
    if (!entry || !key) return;
    let alive = true;
    void entry.promise.then((url) => alive && setFetched({ key, url }));
    return () => {
      alive = false;
    };
  }, [entry, key]);
  if (!entry || !key) return null;
  if (entry.done) return entry.done.url;
  return fetched?.key === key ? fetched.url : null;
}
