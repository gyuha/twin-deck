import type { Scope } from "@twin-deck/keybinds";

export type ActionCategory = "File" | "Navigation" | "View" | "Selection" | "Tab" | "Dialog";

export interface Action<C> {
  id: string;
  title: string;
  category: ActionCategory;
  scopes: Scope[];
  /** 현재 컨텍스트에서 실행 가능한지 (ACT-02). 없으면 항상 가능. */
  isApplicable?(context: C): boolean;
  run(context: C, args?: Record<string, unknown>): void | Promise<void>;
}

export type DispatchResult = "ran" | "inapplicable" | "unknown";

export class ActionRegistry<C> {
  private actions = new Map<string, Action<C>>();

  register(action: Action<C>): void {
    if (this.actions.has(action.id)) {
      throw new Error(`이미 등록된 액션 ID: ${action.id}`);
    }
    this.actions.set(action.id, action);
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  get(id: string): Action<C> | undefined {
    return this.actions.get(id);
  }

  list(): Action<C>[] {
    return [...this.actions.values()];
  }

  isApplicable(id: string, context: C): boolean {
    const action = this.actions.get(id);
    return !!action && (action.isApplicable?.(context) ?? true);
  }

  /** 불가능한 액션은 실행하지 않고 무시한다 (키 입력은 무시, 05 §2). */
  async dispatch(id: string, context: C, args?: Record<string, unknown>): Promise<DispatchResult> {
    const action = this.actions.get(id);
    if (!action) return "unknown";
    if (!(action.isApplicable?.(context) ?? true)) return "inapplicable";
    await action.run(context, args);
    return "ran";
  }
}
