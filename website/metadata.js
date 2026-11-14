import { copy, repo } from "./content.js";

export const siteUrl = "https://huggon1.github.io/postrove/";
export const languages = ["en", "zh-CN"];

export function pageUrl(language) {
  if (!languages.includes(language)) {
    throw new Error(`Unsupported homepage language: ${language}`);
  }
  return language === "en" ? siteUrl : `${siteUrl}zh-CN/`;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderHead(language) {
  const url = pageUrl(language);
  const c = copy[language];
  const image = `${siteUrl}assets/screenshots/reading-${language}.png`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        name: "Postrove",
        url: siteUrl,
        inLanguage: languages,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}#application`,
        name: "Postrove",
        url,
        description: c.description,
        operatingSystem: ["macOS (Apple silicon)", "Windows (x64)"],
        applicationCategory: "ProductivityApplication",
        downloadUrl: `${repo}/releases/latest`,
        screenshot: image,
        license: `${repo}/blob/main/LICENSE`,
      },
    ],
  };

  return [
    `<title>${escapeAttribute(c.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(c.description)}">`,
    `<link rel="canonical" href="${url}">`,
    ...languages.map(
      (alternate) =>
        `<link rel="alternate" hreflang="${alternate}" href="${pageUrl(alternate)}">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${siteUrl}">`,
    `<meta property="og:title" content="${escapeAttribute(c.title)}">`,
    `<meta property="og:description" content="${escapeAttribute(c.intro)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Postrove">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${language === "en" ? "en_US" : "zh_CN"}">`,
    `<meta property="og:locale:alternate" content="${language === "en" ? "zh_CN" : "en_US"}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${escapeAttribute(`${c.viewApp} — ${c.tabRead}`)}">`,
    '<meta property="og:image:width" content="2200">',
    '<meta property="og:image:height" content="1520">',
    `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll("<", "\\u003c")}</script>`,
  ].join("\n    ");
}

export function renderSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${languages.map((language) => `  <url><loc>${pageUrl(language)}</loc></url>`).join("\n")}
</urlset>
`;
}
