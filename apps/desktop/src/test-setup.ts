import "@testing-library/jest-dom/vitest";

// jsdom에는 레이아웃이 없어 clientHeight/scrollHeight가 항상 0이다. 가상 스크롤이 "마지막 행으로 스크롤"의
// 목표 위치를 계산하려면 이 값이 필요하므로, 뷰포트 높이 480과 "첫 자식의 style.height"를 스크롤 높이로 돌려주는
// 최소한의 shim을 둔다. 실제 브라우저의 레이아웃/스크롤 동작을 검증하는 것은 아니다.
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return 480;
  },
});
Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get() {
    const child = this.firstElementChild as HTMLElement | null;
    return Number.parseFloat(child?.style.height ?? "") || 0;
  },
});

// Radix UI(@spacedrive/primitives의 Select 등)는 jsdom에 없는 포인터 캡처와 scrollIntoView를 쓴다.
// 호출만 막는 최소한의 shim이며, 실제 포인터 동작을 검증하는 것은 아니다.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
