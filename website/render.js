import {
  copy,
  repo,
  brand,
  members,
  visual,
  escapeHTML as e,
} from "./content.js";
import { videos } from "./videos.js";
import { renderDetails } from "./details.js";

function feature(id, language, className = "") {
  const c = copy[language],
    s = c.scenes.find((scene) => scene.id === id);
  return `<section class="feature section-width ${className}" id="${id}" aria-labelledby="heading-${id}"><div class="feature-copy"><span class="eyebrow">${e(s.label)}</span><h2 id="heading-${id}">${e(s.title).replace("\n", "<br>")}</h2><p>${e(s.description)}</p><div class="feature-result">${e(s.result)}</div>${id === "architecture" ? `<a class="text-link architecture-link" href="${repo}/blob/main/docs/architecture-overview.md" target="_blank" rel="noopener noreferrer">${e(c.architectureLink)} ↗</a>` : ""}</div><div class="feature-art">${visual(id, language, id === "translate")}<p class="sample-label">${e(id === "architecture" ? c.architectureCaption : c.sample)}</p></div></section>`;
}

export function renderHomepage(language, { assetPrefix = "./" } = {}) {
  if (!Object.hasOwn(copy, language))
    throw new Error(`Unknown homepage language: ${language}`);
  const screenshot = "topics";
  const c = copy[language];
  const guide =
    language === "en"
      ? `${repo}/blob/main/README.md#installation-and-use`
      : `${repo}/blob/main/README.zh-CN.md#安装与使用`;
  const html = `
    <a class="skip-link" href="#main">${language === "en" ? "Skip to content" : "跳至正文"}</a>
    <header class="site-header section-width"><a href="#" aria-label="Postrove">${brand()}</a><nav aria-label="${language === "en" ? "Main navigation" : "主导航"}"><a class="nav-link" href="#ask">${e(c.nav[0])}</a><a class="nav-link" href="#sources">${e(c.nav[1])}</a><a class="nav-link" href="#translate">${e(c.nav[2])}</a><a class="language-button" id="language-toggle" href="${language === "en" ? "./zh-CN/" : "../"}" lang="${language === "en" ? "zh-CN" : "en"}" hreflang="${language === "en" ? "zh-CN" : "en"}">${language === "en" ? "中文" : "English"}</a><a class="button small" href="#download">${e(c.download)}</a></nav></header>
    <main id="main">
      <section class="hero section-width"><div class="hero-copy"><span class="eyebrow">${e(c.eyebrow)}</span><h1>${e(c.hero[0])}<br><span>${e(c.hero[1])}</span></h1><p class="hero-description">${e(c.intro)}</p><div class="hero-actions"><a class="button" href="#download">${e(c.download)} Postrove <span aria-hidden="true">↓</span></a><a class="text-link" href="${repo}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div><p class="availability">${e(c.availability)}</p></div><div class="hero-media"><div class="film-frame"><video id="intro-video" controls playsinline preload="none" poster="./media/poster-${language}.jpg" aria-label="${e(c.watch)}"><source src="${videos[language]}" type="video/mp4"><track kind="captions" src="./media/captions-${language}.vtt" srclang="${language}" label="${language === "en" ? "English" : "中文"}"></video><button id="play-video" class="play-overlay" type="button" hidden><span class="play-icon" aria-hidden="true">▶</span><span>${e(c.watch)}</span></button></div><div class="film-caption"><span>POSTROVE / ${language === "en" ? "A CLOSER LOOK" : "看看如何使用"}</span><span>00:58</span></div><a class="video-fallback" href="${videos[language]}" target="_blank" rel="noopener noreferrer" hidden>${e(c.videoError)} ↗</a></div></section>
      <div class="platform-band section-width"><span>${e(c.nav[0])}</span>${members(language)}</div>
      ${feature("ask", language, "ask-feature")}
      ${feature("languages", language, "languages-feature")}
      ${feature("sources", language, "sources-feature")}
      ${feature("forward", language, "forward-feature")}
      <div class="translation-section">${feature("translate", language, "translation-feature")}</div>
      <div class="local-section">${feature("local", language, "local-feature")}</div>
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
      ${feature("architecture", language, "architecture-feature")}
      ${renderDetails(language)}
      <section class="download-section section-width" id="download"><div><span class="eyebrow">POSTROVE / OPEN SOURCE</span><h2>${e(c.ctaTitle)}</h2><p>${e(c.ctaText)}</p></div><div class="download-actions"><a class="button light" href="${repo}/releases/latest" target="_blank" rel="noopener noreferrer">${e(c.download)} Postrove <span aria-hidden="true">↗</span></a><span>${e(c.availability)}</span></div><div class="setup-line"><p>${e(c.setup)}</p><a href="${guide}" target="_blank" rel="noopener noreferrer">${e(c.gettingStarted)} ↗</a></div></section>
    </main><footer class="section-width">${brand()}<span>${e(c.footer)}</span><a href="${repo}/issues" target="_blank" rel="noopener noreferrer">${e(c.feedback)} ↗</a></footer>`;
  return html
    .replaceAll('src="./', `src="${assetPrefix}`)
    .replaceAll('poster="./', `poster="${assetPrefix}`);
}
