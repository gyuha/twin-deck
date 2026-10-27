// 공개 소개 페이지에서만 수집한다. 로컬 미리보기와 언어 이동 전 페이지는 제외한다.
(() => {
  const url = new URL(window.location.href);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gyuha.com" ||
    !url.pathname.startsWith("/twin-deck/") ||
    window.twinDeckLanguageRedirecting
  ) return;

  const measurementId = "G-6794E26N14";
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    // 같은 도메인의 블로그 쿠키와 분리하고 광고 기능은 사용하지 않는다.
    cookie_prefix: "twin_deck",
    cookie_path: "/twin-deck/",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
})();
