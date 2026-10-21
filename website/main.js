import {
  copy,
  repo,
  brand,
  members,
  visual,
  escapeHTML as e,
} from "./content.js";
import { videos } from "./videos.js";
const requested = new URLSearchParams(location.search).get("lang");
let stored;
try {
  stored = localStorage.getItem("postrove-homepage-language");
} catch {
  /* Use English. */
}
let language = Object.hasOwn(copy, requested)
  ? requested
  : Object.hasOwn(copy, stored)
    ? stored
    : "en";
let screenshot = "topics";
function feature(id, className = "") {
  const c = copy[language],
    s = c.scenes.find((scene) => scene.id === id);
  return `<section class="feature section-width ${className}" id="${id}" aria-labelledby="heading-${id}"><div class="feature-copy"><span class="eyebrow">${e(s.label)}</span><h2 id="heading-${id}">${e(s.title).replace("\n", "<br>")}</h2><p>${e(s.description)}</p><div class="feature-result">${e(s.result)}</div>${id === "architecture" ? `<a class="text-link architecture-link" href="${repo}/blob/main/docs/architecture-overview.md" target="_blank" rel="noopener noreferrer">${e(c.architectureLink)} ↗</a>` : ""}</div><div class="feature-art">${visual(id, language, id === "translate")}<p class="sample-label">${e(id === "architecture" ? c.architectureCaption : c.sample)}</p></div></section>`;
}
function render() {
  const c = copy[language];
  const guide =
    language === "en"
      ? `${repo}#installation-and-use`
      : `${repo}/blob/main/README.zh-CN.md#安装与使用`;
  document.documentElement.lang = language;
  document.title = c.title;
  document.querySelector('meta[name="description"]').content = c.description;
  document.querySelector('meta[property="og:title"]').content = c.title;
  document.querySelector('meta[property="og:description"]').content = c.intro;
  document.querySelector("#app").innerHTML = `
    <a class="skip-link" href="#main">${language === "en" ? "Skip to content" : "跳至正文"}</a>
    <header class="site-header section-width"><a href="#" aria-label="Postrove">${brand()}</a><nav aria-label="${language === "en" ? "Main navigation" : "主导航"}"><a class="nav-link" href="#ask">${e(c.nav[0])}</a><a class="nav-link" href="#sources">${e(c.nav[1])}</a><a class="nav-link" href="#translate">${e(c.nav[2])}</a><button class="language-button" id="language-toggle" type="button" lang="${language === "en" ? "zh-CN" : "en"}">${language === "en" ? "中文" : "English"}</button><a class="button small" href="#download">${e(c.download)}</a></nav></header>
    <main id="main">
      <section class="hero section-width"><div class="hero-copy"><span class="eyebrow">${e(c.eyebrow)}</span><h1>${e(c.hero[0])}<br><span>${e(c.hero[1])}</span></h1><p class="hero-description">${e(c.intro)}</p><div class="hero-actions"><a class="button" href="#download">${e(c.download)} Postrove <span aria-hidden="true">↓</span></a><a class="text-link" href="${repo}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div><p class="availability">${e(c.availability)}</p></div><div class="hero-media"><div class="film-frame"><video id="intro-video" playsinline preload="none" poster="./media/poster-${language}.jpg" aria-label="${e(c.watch)}"><source src="${videos[language]}" type="video/mp4"><track kind="captions" src="./media/captions-${language}.vtt" srclang="${language}" label="${language === "en" ? "English" : "中文"}"></video><button id="play-video" class="play-overlay" type="button"><span class="play-icon" aria-hidden="true">▶</span><span>${e(c.watch)}</span></button></div><div class="film-caption"><span>POSTROVE / ${language === "en" ? "A CLOSER LOOK" : "看看如何使用"}</span><span>00:58</span></div><a class="video-fallback" href="${videos[language]}" target="_blank" rel="noopener noreferrer" hidden>${e(c.videoError)} ↗</a></div></section>
      <div class="platform-band section-width"><span>${e(c.nav[0])}</span>${members(language)}</div>
      ${feature("ask", "ask-feature")}
      ${feature("languages", "languages-feature")}
      ${feature("sources", "sources-feature")}
      ${feature("forward", "forward-feature")}
      <div class="translation-section">${feature("translate", "translation-feature")}</div>
      <div class="local-section">${feature("local", "local-feature")}</div>
      <section class="app-section section-width" aria-labelledby="app-title"><div class="app-heading"><h2 id="app-title">${e(c.viewApp)}</h2><div class="app-tabs" role="group" aria-label="${e(c.viewApp)}">${[
        ["topics", c.tabAsk],
        ["topic", c.tabReply],
        ["reading", c.tabRead],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" data-scene="${id}" aria-pressed="${id === screenshot}">${e(label)}</button>`,
        )
        .join(
          "",
        )}</div></div><div class="app-screenshot"><img id="app-preview" src="./assets/screenshots/${screenshot}-${language}.png" width="2200" height="1520" loading="lazy" alt="${e(c.viewApp)} — ${e({ topics: c.tabAsk, topic: c.tabReply, reading: c.tabRead }[screenshot])}"></div><p class="sample-label">${e(c.appCaption)}</p></section>
      ${feature("architecture", "architecture-feature")}
      <section class="download-section section-width" id="download"><div><span class="eyebrow">POSTROVE / OPEN SOURCE</span><h2>${e(c.ctaTitle)}</h2><p>${e(c.ctaText)}</p></div><div class="download-actions"><a class="button light" href="${repo}/releases/latest" target="_blank" rel="noopener noreferrer">${e(c.download)} Postrove <span aria-hidden="true">↗</span></a><span>${e(c.availability)}</span></div><div class="setup-line"><p>${e(c.setup)}</p><a href="${guide}" target="_blank" rel="noopener noreferrer">${e(c.gettingStarted)} ↗</a></div></section>
    </main><footer class="section-width">${brand()}<span>${e(c.footer)}</span><a href="${repo}/issues" target="_blank" rel="noopener noreferrer">${e(c.feedback)} ↗</a></footer>`;
  document.querySelector("#language-toggle").addEventListener("click", () => {
    document.querySelector("#intro-video").pause();
    language = language === "en" ? "zh-CN" : "en";
    try {
      localStorage.setItem("postrove-homepage-language", language);
    } catch {
      /* Switching works without storage. */
    }
    const url = new URL(location.href);
    url.searchParams.set("lang", language);
    history.replaceState(null, "", url);
    render();
    document.querySelector("#language-toggle").focus({ preventScroll: true });
  });
  const video = document.querySelector("#intro-video"),
    play = document.querySelector("#play-video");
  const fallback = document.querySelector(".video-fallback");
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
      screenshot = button.dataset.scene;
      document.querySelector("#app-preview").src =
        `./assets/screenshots/${screenshot}-${language}.png`;
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
render();
