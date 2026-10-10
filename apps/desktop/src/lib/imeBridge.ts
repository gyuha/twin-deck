// 내장 터미널의 한글(IME) 입력 브리지.
//
// macOS 웹뷰(WebKit)는 이 textarea에서 한글을 조합 이벤트(`compositionstart/update/end`)로 알리지 않는다. 대신 이렇게 보낸다:
//   첫 자모      keydown(keyCode 229) → input type=insertText            data="ㄱ"
//   이어지는 자모 keydown(keyCode 229) → input type=insertReplacementText data="그" → "글"  (앞 글자를 교체)
// xterm.js는 insertText만 처리하고 insertReplacementText는 무시해서, 음절마다 첫 자모만 셸에 갔다(`한글` → `ㅎ ㄱ`).
// 그래서 IME가 가져간 키(keyCode 229)의 input을 xterm에 보여 주지 않고 여기서 직접 처리한다:
//   insertText            → data를 그대로 보낸다.
//   insertReplacementText → 셸에서 앞 글자를 지우고(DEL) data를 보낸다. 그러면 입력 줄에 글자가 바로 보이고 음절이 완성될수록 바뀐다.
//   deleteContentBackward → DEL 하나(조합 중 글자를 지울 때).
// 조합 이벤트를 주는 환경(다른 웹뷰)을 위해 `compositionend`의 확정된 글을 보내는 길도 그대로 둔다. IME를 쓰지 않는 입력은 건드리지 않는다.

const DEL = "\x7f";
/** 입력 상태를 바꾸지 않는 수식·잠금 키(keyCode). */
const MODIFIER_KEYS = new Set([16, 17, 18, 20, 91, 93, 224]);

/** `host` 안의 xterm textarea에 오는 조합·키 이벤트를 가로채 확정된 글만 `send`로 보낸다. 해제 함수를 돌려준다. */
export function installImeBridge(host: HTMLElement, send: (text: string) => void): () => void {
  let composing = false;
  /** 마지막으로 눌린 (수식키가 아닌) 키가 IME가 가져간 키(keyCode 229)였는가. 그 키의 input은 우리가 처리한다. */
  let imeKey = false;
  let endedAt = 0;
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
    // textarea 값은 여기서 지우지 않는다: 조합 중에 값을 건드리면 IME 상태가 어긋난다(아래 onKeyDown에서 조합이 끝난 뒤 비운다).
  };
  // IME가 가져간 키(keyCode 229·조합 중): xterm이 textarea 변화를 읽어 같은 글을 또 보내지 않게 막는다.
  // IME가 아닌 일반 키가 오면 조합은 이미 끝난 것이므로 그때 textarea를 비운다(조합 중에 비우면 IME가 어긋난다).
  const onKeyDown = (e: Event) => {
    const k = e as KeyboardEvent;
    const ime = k.isComposing || k.keyCode === 229 || composing;
    if (ime) {
      imeKey = true;
      stop(e);
      return;
    }
    if (MODIFIER_KEYS.has(k.keyCode)) return;
    imeKey = false;
    const ta = textarea();
    if (ta && ta.value) ta.value = "";
  };
  // IME가 가져간 키의 input(insertText·insertReplacementText·deleteContentBackward)은 여기서 직접 셸로 옮긴다.
  // 조합 중이거나 막 끝난 직후의 input도 xterm에 보이지 않는다(같은 글이 두 번 가지 않게).
  const onInput = (e: Event) => {
    const i = e as InputEvent;
    const type = i.inputType ?? "";
    if (composing || i.isComposing || type.startsWith("insertComposition") || Date.now() - endedAt < 50) return stop(e);
    if (!imeKey) return; // 일반 입력: xterm에 맡긴다
    stop(e);
    if (e.type !== "input") return; // beforeinput은 막기만 하고, 한 번만 처리하려고 input에서 보낸다
    const data = i.data ?? "";
    if (type === "insertReplacementText") {
      log(`REPLACE ${JSON.stringify(data)}`);
      send(DEL + data);
    } else if (type === "insertText" && data) {
      log(`INSERT ${JSON.stringify(data)}`);
      send(data);
    } else if (type === "deleteContentBackward") {
      log("DELETE");
      send(DEL);
    }
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
    preview.remove();
    logBox.remove();
  };
}
