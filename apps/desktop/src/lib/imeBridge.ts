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
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  const preview = document.createElement("div");
  preview.setAttribute("data-ime-preview", "");
  preview.style.cssText = "position:absolute;left:4px;bottom:4px;z-index:10;display:none;padding:1px 6px;border-radius:3px;background:#333;color:#fff;font-size:13px;pointer-events:none";
  host.appendChild(preview);

  const textarea = () => host.querySelector("textarea");
  const stop = (e: Event) => e.stopPropagation();

  // 이벤트 순서를 눈으로 볼 수 있는 진단 표시(Ctrl+Alt+Shift+I로 켜고 끈다). 한글 입력이 어긋날 때 원인을 찾는 데 쓴다.
  const t0 = Date.now();
  const lines: string[] = [];
  const logBox = document.createElement("pre");
  logBox.setAttribute("data-ime-log", "");
  logBox.style.cssText = "position:absolute;right:4px;top:4px;z-index:11;display:none;max-width:60%;max-height:70%;overflow:hidden;margin:0;padding:4px 6px;border-radius:3px;background:rgba(0,0,0,.85);color:#9f9;font:11px/1.3 monospace;pointer-events:none;white-space:pre-wrap";
  host.appendChild(logBox);
  const log = (what: string) => {
    lines.push(`${String(Date.now() - t0).padStart(6)} ${what}`);
    if (lines.length > 40) lines.shift();
    if (logBox.style.display !== "none") logBox.textContent = lines.join("\n");
  };
  const describe = (e: Event) => {
    const k = e as KeyboardEvent & InputEvent & CompositionEvent;
    const v = textarea()?.value ?? "";
    return `${e.type} ${e.type.startsWith("key") ? `key=${JSON.stringify(k.key)} code=${k.code} kc=${k.keyCode}` : ""}${e.type.startsWith("comp") ? `data=${JSON.stringify(k.data)}` : ""}${e.type.includes("input") ? `type=${k.inputType} data=${JSON.stringify(k.data)}` : ""} comp=${k.isComposing ? 1 : 0} ta=${JSON.stringify(v)}`;
  };
  const trace = (e: Event) => log(describe(e));
  const toggleLog = (e: Event) => {
    const k = e as KeyboardEvent;
    if (!(k.ctrlKey && k.altKey && k.shiftKey && k.code === "KeyI")) return;
    logBox.style.display = logBox.style.display === "none" ? "block" : "none";
    logBox.textContent = lines.join("\n");
    e.preventDefault();
  };

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
    if (data) {
      log(`SEND ${JSON.stringify(data)}`);
      send(data);
    }
    // textarea 값은 여기서 바로 지우지 않는다: WebKit은 이 시점에 이미 다음 음절 조합을 시작했을 수 있고, 조합 중에 값을 건드리면
    // IME 상태가 어긋나 모음이 빠진다. 조합이 없는 채로 잠시 지나간 뒤에 비운다.
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      const ta = textarea();
      if (ta && !composing && Date.now() - endedAt >= 300) ta.value = "";
    }, 300);
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
  const traced = ["keydown", "keyup", "compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"];
  for (const t of traced) host.addEventListener(t, trace, opts); // 가장 먼저 등록해 모든 이벤트를 기록한다
  host.addEventListener("keydown", toggleLog, opts);
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
    for (const t of traced) host.removeEventListener(t, trace, opts);
    host.removeEventListener("keydown", toggleLog, opts);
    clearTimeout(clearTimer);
    preview.remove();
    logBox.remove();
  };
}
