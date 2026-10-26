const english = document.documentElement.lang === "en";
const message = (ko, en) => (english ? en : ko);
// 콘텐츠와 다운로드 링크는 JavaScript가 없어도 사용할 수 있다.
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 },
  );
  document
    .querySelectorAll(".reveal")
    .forEach((element) => observer.observe(element));
}

// 캐릭터와 파일 이동 모션은 첫 화면을 보는 동안에만 실행한다.
const hero = document.querySelector(".hero");
let heroVisible = true;
function syncHeroMotion() {
  hero.classList.toggle("motion-paused", !heroVisible || document.hidden);
}
if ("IntersectionObserver" in window) {
  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    syncHeroMotion();
  });
  heroObserver.observe(hero);
}
document.addEventListener("visibilitychange", syncHeroMotion);
syncHeroMotion();

// 테마 수는 처음 화면에 들어올 때만 빠르게 시작해 천천히 마무리한다.
const themeCount = document.querySelector(".theme-count");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let countFrame;
function finishThemeCount() {
  cancelAnimationFrame(countFrame);
  themeCount.textContent = themeCount.dataset.countTo;
}
if ("IntersectionObserver" in window && !motionPreference.matches) {
  themeCount.textContent = "0";
  const countObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      countObserver.disconnect();
      if (motionPreference.matches) return finishThemeCount();
      const target = Number(themeCount.dataset.countTo);
      const started = performance.now();
      themeCount.textContent = "0";
      function tick(now) {
        const progress = Math.min((now - started) / 2000, 1);
        const eased = 1 - (1 - progress) ** 3;
        themeCount.textContent = String(Math.floor(target * eased));
        if (progress < 1) countFrame = requestAnimationFrame(tick);
        else finishThemeCount();
      }
      countFrame = requestAnimationFrame(tick);
    },
    { threshold: 0.5 },
  );
  countObserver.observe(themeCount);
}
motionPreference.addEventListener("change", () => {
  if (motionPreference.matches) finishThemeCount();
});

const actions = english
  ? {
      switch: {
        title: "Your next step. Right beside you.",
        description:
          "Press Tab to switch between panes. With both folders in view, your destination is always in sight.",
        image: "main.png",
        alt: "Two folders displayed side by side",
      },
      copy: {
        title: "Select. F5. Ready to copy.",
        description:
          "Select files and press F5. The other pane is suggested as the destination. Confirm the folder and press Enter to start copying.",
        image: "drag-copy.png",
        alt: "Selected files being copied to the other pane in Twin Deck",
      },
      move: {
        title: "Your destination. Already in view.",
        description:
          "Press F6 to confirm where to move your files. If names conflict, choose to overwrite, skip, or rename.",
        image: "main.png",
        alt: "Two panes showing the source and destination folders",
      },
      preview: {
        title: "One arrow. A closer look.",
        description:
          "Press → to preview a file. Keep the preview open and use ↑ and ↓ to browse the previous and next files.",
        image: "preview-code.png",
        alt: "A source code preview above the file list",
      },
    }
  : {
      switch: {
        title: "시선도, 작업도. 바로 옆으로.",
        description:
          "Tab으로 왼쪽과 오른쪽 패널을 오갑니다. 두 폴더가 함께 보여 다음 목적지를 놓치지 않습니다.",
        image: "main.png",
        alt: "두 폴더를 나란히 보여 주는 듀얼 패널",
      },
      copy: {
        title: "고르고. F5. 복사 준비 끝.",
        description:
          "파일을 고르고 F5를 누르면 반대편 폴더가 복사 대상으로 제안됩니다. 대상을 확인하고 Enter를 누르면 복사가 시작됩니다.",
        image: "drag-copy.png",
        alt: "선택한 파일을 반대쪽 패널로 복사하는 실제 앱 화면",
      },
      move: {
        title: "옮길 곳은, 이미 눈앞에.",
        description:
          "F6으로 이동할 폴더를 확인하세요. 같은 이름의 파일이 있으면 덮어쓰기, 건너뛰기, 이름을 바꿔 처리하기 중에서 고릅니다.",
        image: "main.png",
        alt: "파일의 출발지와 목적지를 함께 보여 주는 두 패널",
      },
      preview: {
        title: "한 번의 화살표. 파일 속으로.",
        description:
          "→ 키로 파일을 미리 봅니다. 미리보기를 열어 둔 채 ↑와 ↓로 이전 파일과 다음 파일을 살펴볼 수 있습니다.",
        image: "preview-code.png",
        alt: "파일 목록 위에 열린 소스 코드 미리보기",
      },
    };
document.querySelectorAll("[data-action]").forEach((button) =>
  button.addEventListener("click", () => {
    const action = actions[button.dataset.action];
    document.querySelectorAll("[data-action]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    document.querySelector("#key-title").textContent = action.title;
    document.querySelector("#key-description").textContent = action.description;
    const image = document.querySelector("#workflow-image");
    image.src = `assets/${action.image}`;
    image.alt = action.alt;
    document.querySelector(".workflow-screen").dataset.mode =
      button.dataset.action;
  }),
);

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus = false) {
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden =
      !active;
  }
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTab(tabs[next], true);
    }
  });
});

const copyButton = document.querySelector("#copy-command");
copyButton.hidden = false;
copyButton.addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(
      document.querySelector("#brew-command").textContent,
    );
    status.textContent = message(
      "명령을 복사했습니다. 터미널에 붙여 넣으세요.",
      "Command copied. Paste it into your terminal.",
    );
  } catch {
    status.textContent = message(
      "자동 복사를 사용할 수 없습니다. 위 명령을 선택해 복사해 주세요.",
      "Automatic copying is unavailable. Select and copy the command above.",
    );
  }
});
