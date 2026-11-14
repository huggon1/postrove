import { copy } from "./content.js";
import { languageFromPath, languageURL, legacyLanguageURL } from "./routes.js";

const legacyURL = legacyLanguageURL(location.href);
if (legacyURL) {
  location.replace(legacyURL);
} else {
  const language = languageFromPath(location.pathname);
  const c = copy[language];
  const languageToggle = document.querySelector("#language-toggle");
  const updateLanguageLink = () => {
    languageToggle.href = languageURL(
      location.href,
      language === "en" ? "zh-CN" : "en",
    );
  };
  updateLanguageLink();
  window.addEventListener("hashchange", updateLanguageLink);
  const video = document.querySelector("#intro-video"),
    play = document.querySelector("#play-video");
  const fallback = document.querySelector(".video-fallback");
  video.controls = false;
  play.hidden = false;
  play.addEventListener("click", async () => {
    play.disabled = true;
    play.setAttribute("aria-busy", "true");
    play.lastElementChild.textContent =
      language === "en" ? "Loading…" : "加载中…";
    video.controls = true;
    try {
      await video.play();
      play.hidden = true;
    } catch {
      play.hidden = true;
      fallback.hidden = false;
    } finally {
      play.removeAttribute("aria-busy");
    }
  });
  video.addEventListener("error", () => {
    fallback.hidden = false;
    play.hidden = true;
  });
  document.querySelectorAll("[data-reading]").forEach((button) =>
    button.addEventListener("click", () => {
      const original = button.dataset.reading === "original";
      document.querySelector("[data-reader-title]").textContent = original
        ? c.originalTitle
        : c.tutorial;
      document.querySelector("[data-reader-text]").textContent = original
        ? c.originalText
        : c.translatedText;
      document.querySelectorAll("[data-reading]").forEach((item) => {
        const selected = item === button;
        item.setAttribute("aria-pressed", String(selected));
        item.classList.toggle("selected", selected);
      });
      document.querySelector(".translation-feature .summary-box").hidden =
        original;
    }),
  );
  document.querySelectorAll("[data-scene]").forEach((button) =>
    button.addEventListener("click", () => {
      const screenshot = button.dataset.scene;
      document.querySelector("#app-preview").src = new URL(
        `./assets/screenshots/${screenshot}-${language}.png`,
        import.meta.url,
      ).href;
      document.querySelector("#app-preview").alt =
        `${c.viewApp} — ${button.textContent}`;
      document
        .querySelectorAll("[data-scene]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
    }),
  );
}
