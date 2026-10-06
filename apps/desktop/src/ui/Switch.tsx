interface SwitchProps {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
}

/** 설정 화면의 켜기/끄기 스위치. 스타일은 index.css의 .td-switch. */
export function Switch({ checked, disabled, onCheckedChange, "aria-label": ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className="td-switch"
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="td-switch-thumb" />
    </button>
  );
}
