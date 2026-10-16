import { assemble, disassemble } from "es-hangul";

/**
 * Quick Select 입력 버퍼: 한글 IME가 `keydown`으로 낱개 자모(`ㅎ`, `ㅏ`, `ㄴ`)를 보내면 버퍼 전체를 다시 음절로 조립한다
 * (`ㅎㅏㄴ` → `한`, `한` + `ㄱ`,`ㅡ`,`ㄹ` → `한글`). 영문·공백·이미 조립된 음절은 그대로 이어 붙는다.
 */
export function appendQuick(buffer: string, char: string): string {
  return assemble([...buffer, char]);
}

/** Backspace: 마지막이 한글 음절이면 자모 하나만 지우고(`글`→`그`→`ㄱ`→없음), 그 밖의 글자는 한 글자를 지운다. */
export function backspaceQuick(buffer: string): string {
  const chars = [...buffer];
  const last = chars.pop();
  if (last === undefined) return "";
  const jamo = [...disassemble(last)];
  if (jamo.length <= 1) return chars.join("");
  return chars.join("") + assemble(jamo.slice(0, -1));
}
