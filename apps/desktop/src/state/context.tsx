import { createContext, useContext, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { currentLanguage, setLanguage, t } from "../i18n";
import type { AppState, AppStore } from "./store";

export const StoreContext = createContext<AppStore | null>(null);

export function useAppStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error(t("error.no_store_context"));
  return s;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore().store, selector);
}

const noopSubscribe = () => () => {};

/**
 * 번역 함수. 화면 언어(`behavior.language`)가 바뀌면 이 훅을 쓰는 컴포넌트가 다시 그려진다.
 * 스토어가 없거나 설정이 일부만 있는 환경(단위 테스트의 가짜 스토어)에서는 지금 언어를 그대로 쓴다.
 */
export function useT(): typeof t {
  const store = useContext(StoreContext)?.store;
  const lang = useSyncExternalStore(store ? store.subscribe : noopSubscribe, () => store?.getState().loaded?.config?.behavior?.language ?? currentLanguage());
  setLanguage(lang);
  return t;
}
