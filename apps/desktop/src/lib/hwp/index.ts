/** 파일이 이보다 크면 읽지 않는다(메모리와 해석 시간 제한). */
export const MAX_BYTES = 20 * 1024 * 1024;

export type HwpDoc = {
  pageCount: number;
  /** `index`번째 쪽을 SVG 문자열로 그린다. */
  renderPage(index: number): string;
  /** wasm 쪽 메모리를 돌려준다. */
  free(): void;
};

type Core = typeof import("@rhwp/core");
let core: Promise<Core> | null = null;

/** 글자 폭을 Canvas로 재는 함수. wasm이 줄바꿈·정렬을 계산할 때 부르므로 초기화 전에 등록해야 한다. */
function registerMeasure() {
  let ctx: CanvasRenderingContext2D | null = null;
  let lastFont = "";
  (globalThis as { measureTextWidth?: (font: string, text: string) => number }).measureTextWidth = (font, text) => {
    ctx ??= document.createElement("canvas").getContext("2d");
    if (!ctx) return text.length * 8;
    if (font !== lastFont) {
      ctx.font = font;
      lastFont = font;
    }
    return ctx.measureText(text).width;
  };
}

/** 라이브러리(wasm 약 12MB)는 처음 HWP를 열 때 한 번만 불러온다. 실패하면 다음에 다시 시도한다. */
function load(): Promise<Core> {
  core ??= (async () => {
    registerMeasure();
    const [mod, wasm] = await Promise.all([import("@rhwp/core"), import("@rhwp/core/rhwp_bg.wasm?url")]);
    await mod.default({ module_or_path: wasm.default });
    return mod;
  })().catch((e) => {
    core = null;
    throw e;
  });
  return core;
}

/** HWP·HWPX 바이트를 열어 쪽 단위로 그릴 수 있게 한다. 암호가 걸렸거나 깨진 파일이면 거부된다. */
export async function readHwp(data: ArrayBuffer): Promise<HwpDoc> {
  const { HwpDocument } = await load();
  const doc = new HwpDocument(new Uint8Array(data));
  return { pageCount: doc.pageCount(), renderPage: (i) => doc.renderPageSvg(i), free: () => doc.free() };
}
