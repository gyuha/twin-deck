import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parentPath } from "@twin-deck/ts-client";
import { MODEL_MAX_BYTES } from "../lib/model";
import { resolveModelUri } from "../lib/model/uri";
import { useAppStore, useT } from "../state/context";

/** `soft` 오류(파일 읽기·해석 실패, 크기 초과)는 대체 표시(`fallback`)로 돌아갈 수 있다. WebGL을 못 쓰는 경우는 안내만 보인다. */
type State = { status: "loading" } | { status: "ready" } | { status: "error"; message: string; soft: boolean };

class NoWebGL extends Error {}

/** 렌더러를 해제하고 WebGL 컨텍스트를 놓는다(`dispose`만으로는 컨텍스트가 GC까지 남는다). */
function release(renderer: import("three").WebGLRenderer | undefined) {
  renderer?.dispose();
  renderer?.forceContextLoss?.();
}

/**
 * 3D 모델 미리보기. 파일을 앱이 여는 주소(`backend.fileUrl`)로 읽어 three.js로 그린다(끌어서 회전, 휠로 확대, 우클릭으로 이동).
 * three.js와 로더는 이 파일을 열 때 동적으로 불러온다. WebGL을 쓸 수 없으면 안내 문구만 보인다.
 * `size`가 상한(`MODEL_MAX_BYTES`)을 넘으면 읽지 않는다. 읽기·해석에 실패했을 때 `fallback`이 있으면(텍스트 형식) 그것을 대신 보인다.
 */
export function ModelView({ path, name, size, fallback }: { path: string; name: string; size: number; fallback?: ReactNode }) {
  const t = useT();
  const { api } = useAppStore();
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setState({ status: "loading" });
    if (size > MODEL_MAX_BYTES) {
      setState({ status: "error", soft: true, message: t("model.too_big", { mb: (size / 1024 / 1024).toFixed(0) }) });
      return;
    }
    let disposed = false;
    let cleanup = () => {};
    let renderer: import("three").WebGLRenderer | undefined;
    void (async () => {
      try {
        const THREE = await import("three");
        let gl: import("three").WebGLRenderer;
        try {
          gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          throw new NoWebGL(t("model.no_webgl"));
        }
        renderer = gl;
        const [{ OrbitControls }, { loadModel, normalize }] = await Promise.all([import("three/addons/controls/OrbitControls.js"), import("../lib/model")]);
        const res = await fetch(api.fileUrl(path));
        if (!res.ok) throw new Error(t("common.read_failed", { status: res.status }));
        const dir = parentPath(path) ?? "";
        const model = await loadModel(name, await res.arrayBuffer(), {
          resolve: (uri) => resolveModelUri(uri, dir, api.fileUrl),
        });
        const norm = await normalize(model);
        if (!norm) throw new Error(t("model.empty"));
        if (disposed) {
          release(renderer);
          return;
        }
        const scene = new THREE.Scene();
        scene.add(norm.object);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.8);
        sun.position.set(1, 2, 3);
        scene.add(sun);
        const camera = new THREE.PerspectiveCamera(45, 1, norm.radius / 100, norm.radius * 100);
        camera.position.set(norm.radius * 1.6, norm.radius * 1.2, norm.radius * 2.4);
        const controls = new OrbitControls(camera, gl.domElement);
        controls.enableDamping = true;
        gl.setPixelRatio(window.devicePixelRatio || 1);
        gl.domElement.style.display = "block";
        el.appendChild(gl.domElement);
        const fit = () => {
          const w = Math.max(el.clientWidth, 1);
          const h = Math.max(el.clientHeight, 1);
          gl.setSize(w, h, false);
          gl.domElement.style.width = "100%";
          gl.domElement.style.height = "100%";
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        let frame = 0;
        const tick = () => {
          controls.update();
          gl.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          controls.dispose();
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            m.geometry?.dispose();
            for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
          });
          release(renderer);
          gl.domElement.remove();
        };
        setState({ status: "ready" });
      } catch (e) {
        release(renderer); // 오류 경로에서도 WebGL 컨텍스트를 놓는다
        if (!disposed) setState({ status: "error", soft: !(e instanceof NoWebGL), message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [api, path, name, size]);
  if (state.status === "error" && state.soft && fallback) return <>{fallback}</>;
  return (
    <div className="relative h-full min-h-48 w-full">
      <div ref={host} role="img" aria-label={t("model.aria")} className="h-full w-full" />
      {state.status === "loading" && <p className="absolute inset-0 flex items-center justify-center text-ink-faint">{t("common.loading")}</p>}
      {state.status === "error" && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center px-3 text-center text-ink-faint">
          {state.message}
        </p>
      )}
    </div>
  );
}
