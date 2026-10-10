// 내장 터미널의 한글(IME) 입력 브리지.
//
// xterm.js는 조합 중인 글을 textarea 값의 차이로 읽어(`setTimeout`) 보낸다. WebKit(macOS 웹뷰)에서는 한글 조합이 끝나는
// `compositionend`가 다음 글자의 조합 시작과 맞물려 오기 때문에 이 방식이 글자를 잃는다(자음만 들어가고 모음이 빠진다).
// 그래서 조합 이벤트를 xterm에 보여 주지 않고 여기서 직접 받아, 확정된 글(`compositionend`의 `data`)만 `send`로 보낸다.
// 조합 중인 글은 터미널 왼쪽 아래의 작은 표시로 보여 준다. IME를 쓰지 않는 입력은 건드리지 않는다.

/** `host` 안의 xterm textarea에 오는 조합·키 이벤트를 가로채 확정된 글만 `send`로 보낸다. 해제 함수를 돌려준다. */
export function installImeBridge(host: HTMLElement, send: (text: string) => void): () => void {
  let composing = false;
  let endedAt = 0;
  const preview = document.createElement("div");
  preview.setAttribute("data-ime-preview", "");
  preview.style.cssText = "position:absolute;left:4px;bottom:4px;z-index:10;display:none;padding:1px 6px;border-radius:3px;background:#333;color:#fff;font-size:13px;pointer-events:none";
  host.appendChild(preview);

  const textarea = () => host.querySelector("textarea");
  const stop = (e: Event) => e.stopPropagation();

  const onStart = (e: Event) => {
    stop(e);
    composing = true;
    preview.textContent = "";
    preview.style.display = "none";
  };
  const onUpdate = (e: Event) => {
    stop(e);
    const data = (e as CompositionEvent).data ?? "";
    preview.textContent = data;
    preview.style.display = data ? "block" : "none";
  };
  const onEnd = (e: Event) => {
    stop(e);
    composing = false;
    endedAt = Date.now();
    preview.textContent = "";
    preview.style.display = "none";
    const data = (e as CompositionEvent).data ?? "";
    const ta = textarea();
    if (ta) ta.value = ""; // xterm이 나중에 이 값을 다시 읽어 보내지 않게 비운다
    if (data) send(data);
  };
  // IME가 가져간 키(keyCode 229·조합 중): xterm이 textarea 변화를 읽어 같은 글을 또 보내지 않게 막는다.
  const onKeyDown = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.isComposing || k.keyCode === 229 || composing) stop(e);
  };
  // 조합 중이거나 막 끝난 직후의 input 이벤트도 xterm에 보이지 않는다(같은 글이 두 번 가지 않게).
  const onInput = (e: Event) => {
    const i = e as InputEvent;
    if (composing || i.isComposing || (i.inputType ?? "").startsWith("insertComposition") || Date.now() - endedAt < 50) stop(e);
  };

  const opts = true; // 캡처 단계: 조상에서 먼저 받아 textarea의 xterm 리스너보다 앞선다
  host.addEventListener("compositionstart", onStart, opts);
  host.addEventListener("compositionupdate", onUpdate, opts);
  host.addEventListener("compositionend", onEnd, opts);
  host.addEventListener("keydown", onKeyDown, opts);
  host.addEventListener("beforeinput", onInput, opts);
  host.addEventListener("input", onInput, opts);
  return () => {
    host.removeEventListener("compositionstart", onStart, opts);
    host.removeEventListener("compositionupdate", onUpdate, opts);
    host.removeEventListener("compositionend", onEnd, opts);
    host.removeEventListener("keydown", onKeyDown, opts);
    host.removeEventListener("beforeinput", onInput, opts);
    host.removeEventListener("input", onInput, opts);
    preview.remove();
  };
}
