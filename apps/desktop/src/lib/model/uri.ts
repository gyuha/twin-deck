/**
 * glTF가 가리키는 외부 파일 주소를 실제로 읽을 주소로 바꾼다. 읽어도 되는 곳만 통과시키고 나머지는 빈 문자열(읽기 실패)로 막는다.
 * - `data:`·`blob:`과 앱이 파일을 여는 주소(`fileUrl`이 만드는 주소)는 그대로 둔다.
 * - 그 밖의 주소(`http(s):`, `file:`, `javascript:`, `//host/…` 등)는 막는다 — 받은 .gltf를 미리보기만 해도 외부로 요청이 나가지 않게 한다.
 * - 상대 경로는 디코드한 뒤 `..`이 있거나 절대 경로면 막고, 아니면 모델이 있는 폴더(`dir`) 아래로만 푼다.
 */
export function resolveModelUri(uri: string, dir: string, fileUrl: (path: string) => string): string {
  if (/^(data|blob):/i.test(uri)) return uri;
  const appOrigin = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i.exec(fileUrl("/"))?.[0];
  if (appOrigin && uri.startsWith(`${appOrigin}/`)) return uri;
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri) && !/^[a-z]:[\\/]/i.test(uri)) return ""; // 다른 스킴(드라이브 문자 `C:\`는 아래에서 절대 경로로 막힌다)
  if (uri.startsWith("//")) return "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return "";
  }
  if (decoded.startsWith("/") || decoded.startsWith("\\") || /^[a-z]:/i.test(decoded)) return "";
  const parts = decoded.split(/[\\/]/).filter((p) => p !== "" && p !== ".");
  if (parts.includes("..")) return "";
  return fileUrl(`${dir.replace(/\/$/, "")}/${parts.join("/")}`);
}
