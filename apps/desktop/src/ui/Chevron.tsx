/**
 * macOS Finder처럼 폴더를 나타내는 꺾쇠(">"). `open`이면 90도 돌려 펼쳐진 모양("⌄")으로 그린다.
 * 폴더 트리의 펼침 표시와 파일 목록의 폴더 표시 칸이 같은 모양을 쓴다.
 */
export function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg aria-hidden data-chevron viewBox="0 0 12 12" className="size-3 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
