import { describe, expect, it } from "vitest";
import { resolveModelUri } from "../lib/model/uri";

const fileUrl = (p: string) => `fake-asset://localhost${p}`; // 앱이 파일을 여는 주소(Tauri에서는 asset://localhost/…)
const resolve = (uri: string) => resolveModelUri(uri, "/home/a/models", fileUrl);

describe("glTF 외부 주소 해석", () => {
  it("외부 서버 주소(http·https·프로토콜 상대)는 차단한다", () => {
    expect(resolve("https://x.example/p.png?id=1")).toBe("");
    expect(resolve("http://x.example/p.png")).toBe("");
    expect(resolve("//x.example/p.png")).toBe("");
    expect(resolve("file:///etc/passwd")).toBe("");
    expect(resolve("javascript:alert(1)")).toBe("");
  });

  it("모델 폴더 밖으로 나가는 상대 경로와 절대 경로는 차단한다", () => {
    expect(resolve("../../secret.bin")).toBe("");
    expect(resolve("tex/../../secret.bin")).toBe("");
    expect(resolve("..%2F..%2Fsecret.bin")).toBe("");
    expect(resolve("/etc/passwd")).toBe("");
    expect(resolve("C:\\Windows\\win.ini")).toBe("");
    expect(resolve("tex\\..\\..\\x.bin")).toBe("");
  });

  it("data·blob 주소와 앱 자원 주소는 그대로 통과한다", () => {
    expect(resolve("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
    expect(resolve("blob:null/abc")).toBe("blob:null/abc");
    expect(resolve("fake-asset://localhost/home/a/x.bin")).toBe("fake-asset://localhost/home/a/x.bin");
  });

  it("정상적인 상대 경로는 모델 폴더 아래 주소로 풀린다(공백·한글 디코드, ./ 무시)", () => {
    expect(resolve("tex/a%20b.png")).toBe("fake-asset://localhost/home/a/models/tex/a b.png");
    expect(resolve("./scene.bin")).toBe("fake-asset://localhost/home/a/models/scene.bin");
    expect(resolve("%ED%85%8D%EC%8A%A4.png")).toBe("fake-asset://localhost/home/a/models/텍스.png");
  });

  it("깨진 퍼센트 인코딩은 차단한다", () => {
    expect(resolve("%E0%A4%A.png")).toBe("");
  });
});
