declare module "occt-import-js" {
  interface OcctMesh {
    color?: [number, number, number];
    attributes: { position: { array: number[] }; normal?: { array: number[] } };
    index: { array: number[] };
  }
  interface OcctResult {
    success: boolean;
    meshes: OcctMesh[];
  }
  export interface Occt {
    ReadStepFile(content: Uint8Array, params: null): OcctResult;
    ReadIgesFile(content: Uint8Array, params: null): OcctResult;
  }
  export default function occtimportjs(options?: Record<string, unknown>): Promise<Occt>;
}

declare module "occt-import-js/dist/occt-import-js.wasm?url" {
  const url: string;
  export default url;
}
