import type { Group, Object3D } from "three";
import { modelKindOf } from "./kinds";
import type { ModelFormat } from "./kinds";

export { modelKindOf } from "./kinds";
export type { ModelFormat } from "./kinds";

export interface LoadOptions {
  /** glTF가 가리키는 외부 파일(.bin, 텍스처)의 상대 주소를 실제 주소로 바꾼다. */
  resolve?: (uri: string) => string;
  /** Draco 디코더. 안 주면 번들한 `draco/` 디코더를 쓰는 `DRACOLoader`를 만든다. */
  dracoLoader?: unknown;
  /** occt-import-js 초기화 옵션(테스트에서 wasm을 직접 넘길 때). 안 주면 번들한 wasm 주소를 쓴다. */
  occt?: Record<string, unknown>;
}

export interface Normalized {
  object: Group;
  /** 가운데로 옮긴 뒤 모델을 감싸는 구의 반지름(카메라 거리 계산용). */
  radius: number;
}

/** 모델을 원점 가운데로 옮기는 그룹으로 감싸고 크기를 잰다. 비어 있으면 null. */
export async function normalize(model: Object3D): Promise<Normalized | null> {
  const THREE = await import("three");
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  model.position.sub(center);
  pivot.add(model);
  return { object: pivot, radius: Math.max(size.length() / 2, 1e-6) };
}

async function meshOf(THREE: typeof import("three"), geometry: import("three").BufferGeometry, color?: number) {
  if (!geometry.attributes.normal && geometry.index !== undefined) geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: color ?? 0xb8c4d6, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }));
}

let occtPromise: Promise<import("occt-import-js").Occt> | undefined;
/** occt-import-js는 같은 페이지에서 두 번 초기화하면 오류가 나서 처음 만든 인스턴스를 계속 쓴다. */
function getOcct(options?: Record<string, unknown>) {
  occtPromise ??= (async () => {
    const init = (await import("occt-import-js")).default;
    const wasmUrl = (await import("occt-import-js/dist/occt-import-js.wasm?url")).default;
    return init(options ?? { locateFile: () => wasmUrl });
  })();
  return occtPromise;
}

/** 파일 바이트를 three.js 객체로 읽는다. 로더는 형식마다 동적으로 불러와 메인 번들에 들어가지 않는다. 지원하지 않는 이름이면 오류. */
export async function loadModel(name: string, data: ArrayBuffer, opts: LoadOptions = {}): Promise<Object3D> {
  const format = modelKindOf(name);
  if (!format) throw new Error(`지원하지 않는 3D 형식입니다: ${name}`);
  const THREE = await import("three");
  const text = () => new TextDecoder().decode(data);
  switch (format satisfies ModelFormat) {
    case "stl": {
      const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
      return meshOf(THREE, new STLLoader().parse(data));
    }
    case "ply": {
      const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
      const geometry = new PLYLoader().parse(data);
      if (geometry.index) return meshOf(THREE, geometry);
      return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.02, vertexColors: !!geometry.attributes.color, color: geometry.attributes.color ? 0xffffff : 0xb8c4d6 }));
    }
    case "obj": {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      const group = new OBJLoader().parse(text());
      group.traverse((o) => {
        if ((o as import("three").Mesh).isMesh) (o as import("three").Mesh).material = new THREE.MeshStandardMaterial({ color: 0xb8c4d6, roughness: 0.7, side: THREE.DoubleSide });
      });
      return group;
    }
    case "fbx": {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      return new FBXLoader().parse(data, "");
    }
    case "3mf": {
      const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
      return new ThreeMFLoader().parse(data);
    }
    case "usdz": {
      const { USDLoader } = await import("three/addons/loaders/USDLoader.js");
      return new USDLoader().parse(data);
    }
    case "gcode": {
      const { GCodeLoader } = await import("three/addons/loaders/GCodeLoader.js");
      return new GCodeLoader().parse(text());
    }
    case "gltf": {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const manager = new THREE.LoadingManager();
      if (opts.resolve) manager.setURLModifier(opts.resolve);
      const loader = new GLTFLoader(manager);
      if (opts.dracoLoader) loader.setDRACOLoader(opts.dracoLoader as never);
      else {
        const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
        loader.setDRACOLoader(new DRACOLoader(manager).setDecoderPath(`${import.meta.env.BASE_URL}draco/`));
      }
      return new Promise((resolve, reject) => loader.parse(data, "", (g) => resolve(g.scene), reject));
    }
    case "step":
    case "iges": {
      const occt = await getOcct(opts.occt);
      const bytes = new Uint8Array(data);
      const res = format === "step" ? occt.ReadStepFile(bytes, null) : occt.ReadIgesFile(bytes, null);
      if (!res.success) throw new Error("CAD 파일을 읽지 못했습니다");
      const group = new THREE.Group();
      for (const m of res.meshes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
        if (m.attributes.normal) g.setAttribute("normal", new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
        g.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.index.array), 1));
        const color = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]).getHex() : undefined;
        group.add(await meshOf(THREE, g, color));
      }
      return group;
    }
  }
}
