import { useEffect, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
let diagramSequence = 0;
const emptyImages: { url: string; cachedUrl?: string }[] = [];
export function Markdown({
  children,
  images = emptyImages,
}: {
  children: string;
  images?: { url: string; cachedUrl?: string }[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const html = DOMPurify.sanitize(marked.parse(children, { async: false }), {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "a",
      "img",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
    ALLOWED_URI_REGEXP: /^https:\/\//i,
  });
  useEffect(() => {
    let active = true;
    for (const image of root.current?.querySelectorAll("img") ?? []) {
      const stored = images.find(
        (item) => item.url === image.getAttribute("src"),
      );
      if (stored?.cachedUrl) image.src = stored.cachedUrl;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
    }
    const codes = [
      ...(root.current?.querySelectorAll("code.language-mermaid") ?? []),
    ];
    if (codes.length)
      void import("mermaid").then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          htmlLabels: false,
        });
        for (const code of codes) {
          try {
            const { svg } = await mermaid.render(
              `reading-diagram-${++diagramSequence}`,
              code.textContent ?? "",
            );
            if (active && code.parentElement)
              code.parentElement.innerHTML = DOMPurify.sanitize(svg, {
                USE_PROFILES: { svg: true, svgFilters: true },
              });
          } catch {
            /* The source diagram remains readable as code. */
          }
        }
      });
    return () => {
      active = false;
    };
  }, [html, images]);
  return (
    <div
      className="markdown"
      ref={root}
      onClick={(event) => {
        const link = (event.target as Element).closest("a");
        if (link) {
          event.preventDefault();
          void window.postrove.openRepositoryLink(link.href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
