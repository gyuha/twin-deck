import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { AppState, AppStore } from "./store";

export const StoreContext = createContext<AppStore | null>(null);

export function useAppStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreContext 밖에서 사용할 수 없습니다");
  return s;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore().store, selector);
}
