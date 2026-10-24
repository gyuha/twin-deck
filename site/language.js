// 첫 화면을 그리기 전에 언어를 고른다. 직접 선택한 언어가 브라우저 설정보다 우선한다.
(() => {
  const url = new URL(window.location.href);
  const valid = (value) => value === "ko" || value === "en";
  const requested = url.searchParams.get("lang");
  let saved;
  try {
    saved = localStorage.getItem("twin-deck-site-language");
    if (valid(requested))
      localStorage.setItem("twin-deck-site-language", requested);
  } catch {
    /* 저장소가 차단되어도 URL과 브라우저 언어로 동작한다. */
  }
  const browser = navigator.languages?.[0] || navigator.language || "en";
  const current = document.documentElement.lang;
  const language = valid(requested)
    ? requested
    : current === "en"
      ? "en"
      : valid(saved)
        ? saved
        : /^ko(?:-|$)/i.test(browser)
          ? "ko"
          : "en";
  if (language !== current) {
    const target = new URL(language === "en" ? "en.html" : "index.html", url);
    target.search = url.search;
    target.hash = url.hash;
    window.location.replace(target.href);
  }
})();
