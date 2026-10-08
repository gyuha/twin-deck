import { useEffect, useRef, useState } from "react";
import { useT } from "../state/context";

/**
 * 사운드 파일 미리보기. 열어도 바로 재생하지 않고, 웹뷰의 기본 재생 UI(▶, 시간, 진행 막대, 볼륨)만 띄운다.
 * 재생 버튼을 클릭해야 재생된다(설정 `preview.audio_autoplay`를 켜면 바로 재생한다). data URL은 Blob URL로 바꿔 쓴다(탐색이 빠르다).
 */
export function AudioView({ dataUrl, name, autoplay = false }: { dataUrl: string; name: string; autoplay?: boolean }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setSrc(null);
    setFailed(false);
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dataUrl]);
  // 닫거나 다른 파일로 넘어가면 재생을 멈추고 소리 자원을 놓는다(요소가 사라져도 재생이 이어지지 않게).
  // 정리 시점에는 ref가 이미 비어 있어서, 요소를 효과가 시작될 때 붙잡아 둔다.
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (!el) return;
      el.pause();
      // 요소가 이미 DOM에서 떨어졌을 때만 소리 자원을 놓는다(개발 모드의 가짜 정리에서 src를 지우지 않게).
      if (!el.isConnected) {
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [src]);
  if (failed) return <p className="text-ink-faint">{t("media.unplayable", { name })}</p>;
  if (!src) return <p className="text-ink-faint">{t("media.opening")}</p>;
  return (
    <div className="flex h-full items-center justify-center">
      <audio ref={audioRef} key={src} aria-label={t("media.audio_aria", { name })} controls preload="metadata" autoPlay={autoplay} src={src} onCanPlay={() => {
          const el = audioRef.current;
          if (autoplay && el?.paused) void el.play().catch(() => {});
        }}
        onError={() => setFailed(true)} />
    </div>
  );
}
