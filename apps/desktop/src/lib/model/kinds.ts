/** 3D 모델 미리보기가 읽는 형식. 한 형식이 여러 확장자를 가진다(glb/gltf, step/stp, iges/igs). */
export type ModelFormat = "gltf" | "obj" | "fbx" | "stl" | "3mf" | "ply" | "step" | "iges" | "usdz" | "gcode";

const BY_EXT: Record<string, ModelFormat> = {
  glb: "gltf",
  gltf: "gltf",
  obj: "obj",
  fbx: "fbx",
  stl: "stl",
  "3mf": "3mf",
  ply: "ply",
  step: "step",
  stp: "step",
  iges: "iges",
  igs: "iges",
  usdz: "usdz",
  gcode: "gcode",
};

/** 파일 이름의 확장자(대소문자 무시)로 3D 형식을 고른다. 지원하지 않으면 null. three.js를 불러오지 않는 가벼운 함수다. */
export function modelKindOf(name: string): ModelFormat | null {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXT[base.slice(dot + 1).toLowerCase()] ?? null;
}
