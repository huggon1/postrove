/** Self-contained: Playwright serializes this function into the observed page. */
export function isAssistantReply(element: Element): boolean {
  if (
    element.ownerDocument.location?.hostname === "gemini.google.com" &&
    (element.closest("model-response-content") ||
      element.ownerDocument.querySelector("model-response-content")) &&
    element.tagName !== "MODEL-RESPONSE-CONTENT"
  )
    return false;
  if (
    ["HTML", "BODY", "MAIN", "NAV", "ASIDE", "FORM"].includes(
      element.tagName,
    ) ||
    element.getAttribute("role") === "main"
  )
    return false;
  const mixed =
    'input:not([type="hidden"]),textarea,[contenteditable="true"],[role="textbox"],user-query,[data-message-author-role="user"]';
  const roots: (Element | ShadowRoot)[] = [element];
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    if (root instanceof Element && root.matches(mixed)) return false;
    if (root.querySelector(mixed)) return false;
    for (const node of [root, ...root.querySelectorAll("*")])
      if (node instanceof Element && node.shadowRoot)
        roots.push(node.shadowRoot);
  }
  return true;
}

/** Self-contained: Playwright serializes this function into the observed page. */
export function capturedText(element: Element): string | undefined {
  if (!element.isConnected) return undefined;
  const hasShadow =
    !!element.shadowRoot ||
    [...element.querySelectorAll("*")].some((node) => node.shadowRoot);
  if (!hasShadow) return (element as HTMLElement).innerText;
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      ["SCRIPT", "STYLE"].includes(node.tagName)
    )
      return "";
    if (node.tagName === "BR") return "\n";
    const children =
      node instanceof HTMLSlotElement
        ? node.assignedNodes({ flatten: true })
        : [];
    const body = [
      ...(children.length
        ? children
        : (node.shadowRoot?.childNodes ?? node.childNodes)),
    ]
      .map(read)
      .join("");
    return /^(block|flex|grid|list-item|table)/.test(style.display)
      ? `\n${body}\n`
      : body;
  };
  return read(element)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
