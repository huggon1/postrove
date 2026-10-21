import { copy, brand, visual, escapeHTML as e } from "./content.js";
const query = new URLSearchParams(location.search);
const lang = query.get("lang") === "en" ? "en" : "zh-CN";
const c = copy[lang],
  id = query.get("id");
const single = c.scenes.find((scene) => scene.id === id);
document.documentElement.lang = lang;
const poster = (s, index) =>
  `<article class="poster poster-${s.id}" id="poster-${s.id}"><div class="poster-top">${brand()}<span>${e(s.label)}</span></div><div class="poster-copy"><h1>${e(s.title).replace("\n", "<br>")}</h1><p>${e(s.description)}</p></div><div class="poster-art">${visual(s.id, lang)}</div><div class="poster-result">${e(s.result)}</div><div class="poster-bottom"><span>${e(s.id === "architecture" ? c.architectureCaption : c.sample)}</span><span>POSTROVE / ${String(index + 1).padStart(2, "0")}</span></div></article>`;
if (single) {
  document.body.classList.add("single-poster");
  document.querySelector("#cards").innerHTML = poster(
    single,
    c.scenes.indexOf(single),
  );
} else {
  document.querySelector("#cards").innerHTML =
    `<header class="gallery-head"><div>${brand()}<h1>${lang === "en" ? "Feature cards" : "宣传图片"}</h1><p>${lang === "en" ? "Eight images, shared with the homepage. Each feature stands on its own." : "与网站共用内容和视觉组件。每张图单独介绍一个功能特点。"}</p></div><div class="gallery-actions"><a class="text-link" href="./?lang=${lang}">${lang === "en" ? "Homepage" : "查看网站"} ↗</a><a class="text-link" href="?lang=${lang === "en" ? "zh-CN" : "en"}">${lang === "en" ? "中文" : "English"}</a><a class="button" href="./exports/postrove-cards-${lang}.zip" download>${lang === "en" ? "Download all" : "下载整组 PNG"}</a></div></header><main class="gallery-grid">${c.scenes.map((s, i) => `<section class="gallery-item"><a class="poster-preview" href="?id=${s.id}&lang=${lang}" target="_blank" rel="noopener noreferrer" aria-label="${e(s.label)}">${poster(s, i)}</a><div class="gallery-caption"><strong>${String(i + 1).padStart(2, "0")} · ${e(s.label)}</strong><a href="./exports/${lang}/${String(i + 1).padStart(2, "0")}-${s.id}.png" download>PNG ↓</a></div></section>`).join("")}</main>`;
}
