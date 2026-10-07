import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Box3, BufferGeometry, Float32BufferAttribute, Mesh } from "three";
import draco3d from "draco3d";
import { loadModel, modelKindOf, normalize } from "../lib/model";

const FIX = resolve(__dirname, "fixtures/models");
const bytes = (file: string) => {
  const b = readFileSync(resolve(FIX, file));
  return Uint8Array.from(b).buffer; // jsdom 환경의 ArrayBuffer로 만든다(로더가 instanceof로 구분한다)
};
// jsdom에서는 occt의 wasm을 파일 주소로 불러올 수 없어서 바이트를 직접 넘긴다.
const occt = { wasmBinary: readFileSync(resolve(__dirname, "../../node_modules/occt-import-js/dist/occt-import-js.wasm")) };

/** 브라우저의 DRACOLoader(웹 워커)를 대신하는 노드용 디코더. GLTFLoader의 Draco 확장이 부르는 인터페이스만 흉내 낸다. */
async function nodeDraco() {
  const dec = await draco3d.createDecoderModule({});
  return {
    preload() {},
    decodeDracoFile(buffer: ArrayBuffer, callback: (g: BufferGeometry) => void, attributeIDs: Record<string, number>, _types: unknown, _cs: unknown, onError: (e: unknown) => void) {
      try {
        const decoder = new dec.Decoder();
        const db = new dec.DecoderBuffer();
        db.Init(new Int8Array(buffer), buffer.byteLength);
        const mesh = new dec.Mesh();
        if (!decoder.DecodeBufferToMesh(db, mesh).ok()) throw new Error("draco decode failed");
        const geometry = new BufferGeometry();
        const points = mesh.num_points();
        for (const [name, id] of Object.entries(attributeIDs)) {
          const attr = decoder.GetAttributeByUniqueId(mesh, id);
          const size = attr.num_components();
          const ptr = dec._malloc(points * size * 4);
          decoder.GetAttributeDataArrayForAllPoints(mesh, attr, dec.DT_FLOAT32, points * size * 4, ptr);
          geometry.setAttribute(name, new Float32BufferAttribute(new Float32Array(dec.HEAPF32.buffer, ptr, points * size).slice(), size));
          dec._free(ptr);
        }
        const faces = mesh.num_faces();
        const iptr = dec._malloc(faces * 3 * 4);
        decoder.GetTrianglesUInt32Array(mesh, faces * 3 * 4, iptr);
        geometry.setIndex(Array.from(new Uint32Array(dec.HEAPU32.buffer, iptr, faces * 3)));
        dec._free(iptr);
        callback(geometry);
      } catch (e) {
        onError(e);
      }
    },
  };
}

const CASES: [string, string][] = [
  ["glb", "tri.glb"],
  ["gltf", "tri.gltf"],
  ["obj", "cube.obj"],
  ["fbx", "tri.fbx"],
  ["stl", "tetra.stl"],
  ["3mf", "tetra.3mf"],
  ["ply", "tetra.ply"],
  ["step", "cube.step"],
  ["stp", "cube.stp"],
  ["iges", "sheet.iges"],
  ["igs", "sheet.igs"],
  ["usdz", "tri.usdz"],
  ["gcode", "square.gcode"],
];

const finite = (box: Box3) => [box.min, box.max].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));

describe("3D 모델 형식 13종 로더", () => {
  it.each(CASES)("%s 픽스처를 읽어 유한하고 비어 있지 않은 크기를 낸다", async (_ext, file) => {
    const model = await loadModel(file, bytes(file), { occt });
    const n = await normalize(model);
    expect(n).not.toBeNull();
    const box = new Box3().setFromObject(n!.object);
    expect(finite(box)).toBe(true);
    expect(box.isEmpty()).toBe(false);
    const c = box.getCenter(box.min.clone());
    expect(Math.hypot(c.x, c.y, c.z)).toBeLessThan(1e-4); // 가운데로 옮겨진다
    expect(n!.radius).toBeGreaterThan(0);
  });

  it("확장자 13개가 모두 3D 형식으로 인식된다", () => {
    expect(CASES.every(([ext, file]) => modelKindOf(file) !== null && file.toLowerCase().endsWith(ext))).toBe(true);
  });
});

describe("modelKindOf", () => {
  it("대소문자·경로·같은 형식의 다른 확장자를 처리한다", () => {
    expect(modelKindOf("A.GLB")).toBe("gltf");
    expect(modelKindOf("/x/y/part.STP")).toBe("step");
    expect(modelKindOf("part.step")).toBe("step");
    expect(modelKindOf("a.igs")).toBe("iges");
    expect(modelKindOf("C:\\m\\a.Iges")).toBe("iges");
  });
  it("확장자가 없거나 지원하지 않으면 null", () => {
    expect(modelKindOf("README")).toBeNull();
    expect(modelKindOf("notes.txt")).toBeNull();
    expect(modelKindOf(".stl")).toBeNull();
    expect(modelKindOf("dir.stl/readme")).toBeNull();
  });
});

describe("Draco 압축 glTF", () => {
  it("Draco 압축 GLB가 로컬 디코더로 풀려 메시가 나온다", async () => {
    const model = await loadModel("tetra-draco.glb", bytes("tetra-draco.glb"), { dracoLoader: await nodeDraco() });
    let verts = 0;
    model.traverse((o) => {
      if ((o as Mesh).isMesh) verts += (o as Mesh).geometry.attributes.position.count;
    });
    expect(verts).toBe(4);
  });
  it("번들한 디코더 파일이 public/draco에 있고 외부 주소를 쓰지 않는다", () => {
    for (const f of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) expect(() => readFileSync(resolve(__dirname, "../../public/draco", f))).not.toThrow();
    const src = readFileSync(resolve(__dirname, "../lib/model/index.ts"), "utf8");
    expect(src).toContain("draco/");
    expect(src).not.toMatch(/gstatic|cdn\.|unpkg/);
  });
});
