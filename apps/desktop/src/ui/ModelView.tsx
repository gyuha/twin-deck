import { useEffect, useRef, useState } from "react";
import { parentPath } from "@twin-deck/ts-client";
import { useAppStore } from "../state/context";

type State = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

const EXTERNAL = /^(data:|blob:|https?:|asset:|fake-asset:)/i;

/**
 * 3D 모델 미리보기. 파일을 앱이 여는 주소(`backend.fileUrl`)로 읽어 three.js로 그린다(끌어서 회전, 휠로 확대, 우클릭으로 이동).
 * three.js와 로더는 이 파일을 열 때 동적으로 불러온다. WebGL을 쓸 수 없으면 안내 문구만 보인다.
 */
export function ModelView({ path, name }: { path: string; name: string }) {
  const { api } = useAppStore();
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setState({ status: "loading" });
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      try {
        const THREE = await import("three");
        let renderer: import("three").WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          throw new Error("3D 미리보기를 쓸 수 없습니다 (이 화면에서 WebGL을 켤 수 없습니다)");
        }
        const [{ OrbitControls }, { loadModel, normalize }] = await Promise.all([import("three/addons/controls/OrbitControls.js"), import("../lib/model")]);
        const res = await fetch(api.fileUrl(path));
        if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
        const dir = parentPath(path) ?? "";
        const model = await loadModel(name, await res.arrayBuffer(), {
          resolve: (uri) => (EXTERNAL.test(uri) ? uri : api.fileUrl(`${dir.replace(/\/$/, "")}/${decodeURIComponent(uri)}`)),
        });
        const norm = await normalize(model);
        if (!norm) throw new Error("그릴 수 있는 모양이 없는 파일입니다");
        if (disposed) {
          renderer.dispose();
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
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.domElement.style.display = "block";
        el.appendChild(renderer.domElement);
        const fit = () => {
          const w = Math.max(el.clientWidth, 1);
          const h = Math.max(el.clientHeight, 1);
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = "100%";
          renderer.domElement.style.height = "100%";
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        let frame = 0;
        const tick = () => {
          controls.update();
          renderer.render(scene, camera);
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
          renderer.dispose();
          renderer.domElement.remove();
        };
        setState({ status: "ready" });
      } catch (e) {
        if (!disposed) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [api, path, name]);
  return (
    <div className="relative h-full min-h-48 w-full">
      <div ref={host} role="img" aria-label="3D 모델 미리보기" className="h-full w-full" />
      {state.status === "loading" && <p className="absolute inset-0 flex items-center justify-center text-ink-faint">불러오는 중…</p>}
      {state.status === "error" && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center px-3 text-center text-ink-faint">
          {state.message}
        </p>
      )}
    </div>
  );
}
