import { useEffect, useRef, useState } from "react";
import { useAppStore, useT } from "../state/context";

/**
 * 비디오 파일 미리보기. 파일을 데이터로 싣지 않고 앱이 여는 주소(`backend.fileUrl`)로 스트리밍한다(큰 파일, 탐색).
 * 열어도 바로 재생하지 않고 재생 UI만 띄운다(설정 `preview.video_autoplay`를 켜면 바로 재생한다).
 */
export function VideoView({ path, name, autoplay = false }: { path: string; name: string; autoplay?: boolean }) {
  const t = useT();
  const { api } = useAppStore();
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);
  const src = api.fileUrl(path);
  useEffect(() => setFailed(false), [src]);
  // 닫거나 다른 파일로 넘어가면 재생을 멈추고 자원을 놓는다. 정리 시점에는 ref가 비어 있어 시작 때 요소를 붙잡아 둔다.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      el.pause();
      // 요소가 이미 DOM에서 떨어졌을 때만 소리 자원을 놓는다(개발 모드의 가짜 정리에서 src를 지우지 않게).
      if (!el.isConnected) {
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [src, failed]);
  if (failed) return <p className="text-ink-faint">{t("media.unplayable", { name })}</p>;
  return (
    <div className="flex h-full items-center justify-center">
      <video
        ref={ref}
        key={src}
        aria-label={t("media.video_aria", { name })}
        controls
        preload="metadata"
        autoPlay={autoplay}
        src={`${src}#t=0.001`} // 첫 장면이 보이게 한다(메타데이터만 읽으면 웹뷰가 빈 화면을 그린다)
        onCanPlay={() => {
          // autoplay 속성을 웹뷰가 무시하는 경우가 있어, 옵션이 켜져 있으면 재생 가능해질 때 직접 재생을 시작한다.
          const el = ref.current;
          if (autoplay && el?.paused) void el.play().catch(() => {});
        }}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full"
      />
    </div>
  );
}
