/** 터미널 글에서 눌러 열 수 있는 주소(`http`·`https`)를 찾는다(이슈 #107). */
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** 문장 끝에 붙은 문장부호는 주소에서 뺀다. 닫는 괄호는 주소 안에 짝이 있을 때만 남긴다(`.../Foo_(bar)`). */
function trimUrl(url: string): string {
  for (;;) {
    const last = url[url.length - 1];
    const open = CLOSERS[last];
    const unbalanced = open !== undefined && url.split(last).length > url.split(open).length;
    if (/[.,;:!?]/.test(last) || unbalanced) url = url.slice(0, -1);
    else return url;
  }
}

/** 한 줄의 글에서 주소를 찾아 글자 위치 `[start, end)`와 주소를 돌려준다. */
export function findUrls(text: string): { start: number; end: number; url: string }[] {
  const found: { start: number; end: number; url: string }[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    // 스킴만 남았으면(`https://`) 주소가 아니다.
    if (/^https?:\/\/$/.test(url)) continue;
    found.push({ start: m.index, end: m.index + url.length, url });
  }
  return found;
}
