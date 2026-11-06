/** Complete a whole browser address while preserving its path and access parameters. */
export function completeLinkInput(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return;
  const explicit = /^https:\/\/[^/?#]/i.test(value);
  if (value.startsWith("///")) return;
  if (!explicit) {
    const authority = value.replace(/^\/\//, "").split(/[/?#]/, 1)[0];
    if (authority.includes(":") && !/^[^:]+:\d+$/.test(authority)) return;
  }
  const candidate = explicit
    ? value
    : value.startsWith("//")
      ? `https:${value}`
      : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (!explicit) {
      // Bare input must name a domain, so questions and local paths stay text.
      const labels = url.hostname.split(".");
      if (
        labels.length < 2 ||
        labels.some(
          (label) =>
            label.length > 63 ||
            !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
        ) ||
        !/^[a-z][a-z0-9-]*$/i.test(labels.at(-1)!)
      )
        return;
    }
    return candidate;
  } catch {
    return;
  }
}
