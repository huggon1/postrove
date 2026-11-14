export function languageFromPath(pathname) {
  return /\/zh-CN(?:\/(?:index\.html)?)?$/.test(pathname) ? "zh-CN" : "en";
}

export function languageURL(href, language) {
  if (language !== "en" && language !== "zh-CN")
    throw new Error(`Unknown homepage language: ${language}`);
  const url = new URL(href);
  const root =
    languageFromPath(url.pathname) === "zh-CN"
      ? url.pathname.replace(/zh-CN(?:\/(?:index\.html)?)?$/, "")
      : url.pathname.replace(/index\.html$/, "");
  url.pathname = `${root.endsWith("/") ? root : `${root}/`}${language === "zh-CN" ? "zh-CN/" : ""}`;
  url.searchParams.delete("lang");
  return url.href;
}

export function legacyLanguageURL(href) {
  const url = new URL(href);
  const requested = url.searchParams.get("lang");
  return requested === "en" || requested === "zh-CN"
    ? languageURL(url.href, requested)
    : null;
}
