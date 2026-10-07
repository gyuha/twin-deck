import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModel } from "../lib/model";

/** jsdom 환경의 ArrayBuffer로 만든다(로더가 instanceof로 구분한다). */
const fixture = (name: string) => Uint8Array.from(readFileSync(pathResolve(__dirname, "fixtures/models", name))).buffer;

/** FileLoader가 보내는 요청 주소를 모은다. jsdom에는 Request 주소 검사·Worker·createObjectURL이 없어 가짜로 대신한다. */
let requested: string[] = [];
beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "Request",
    class {
      url: string;
      constructor(url: string) {
        this.url = url;
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: { url: string }) => {
      requested.push(req.url);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(4) };
    }),
  );
  vi.stubGlobal("Worker", class { postMessage() {} addEventListener() {} terminate() {} });
  URL.createObjectURL = () => "blob:x";
});
afterEach(() => vi.unstubAllGlobals());

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
};

/** ModelView와 같은 규칙: 외부 주소가 아니면 모델 폴더 아래 주소로 바꾼다. */
const modelFolderResolve = (seen: string[]) => (uri: string) => {
  seen.push(uri);
  return /^(data:|blob:|https?:|asset:)/i.test(uri) ? uri : `asset://localhost/models//${uri}`;
};

describe("Draco 디코더 주소", () => {
  it("디코더 파일은 모델 폴더 규칙(resolve)을 거치지 않고 앱 자원 주소로 요청된다", async () => {
    const seen: string[] = [];
    void loadModel("tetra-draco.glb", fixture("tetra-draco.glb"), { resolve: modelFolderResolve(seen) }).catch(() => {});
    await until(() => requested.some((u) => u.includes("draco_wasm_wrapper")) && requested.some((u) => u.includes("draco_decoder.wasm")));
    const decoder = requested.filter((u) => u.includes("draco"));
    expect(decoder.length).toBeGreaterThanOrEqual(2);
    for (const u of decoder) {
      expect(u).not.toMatch(/asset:|models\/\//);
      expect(u).toMatch(/draco\/draco_/);
    }
    expect(seen.filter((u) => u.includes("draco"))).toEqual([]);
  });

  it("glTF가 가리키는 외부 텍스처·버퍼 주소는 여전히 resolve를 거친다", async () => {
    // 메시가 버퍼를 읽고(accessor) 재질이 텍스처를 쓰도록 연결해야 로더가 외부 파일을 요청한다.
    const gltf = {
      asset: { version: "2.0" },
      buffers: [{ uri: "scene.bin", byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
      images: [{ uri: "tex/a.png" }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };
    const seen: string[] = [];
    void loadModel("m.gltf", Uint8Array.from(new TextEncoder().encode(JSON.stringify(gltf))).buffer, { resolve: modelFolderResolve(seen) }).catch(() => {});
    await until(() => seen.includes("scene.bin"));
    expect(seen).toContain("scene.bin");
  });
});
