import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      if (
        anchor.bottom <= 0 ||
        anchor.top >= innerHeight ||
        anchor.right <= 0 ||
        anchor.left >= innerWidth
      ) {
        close();
        return;
      }
      const gap = 8;
      const availableAbove = Math.max(0, anchor.top - gap * 2);
      const availableBelow = Math.max(0, innerHeight - anchor.bottom - gap * 2);
      const height = panel.current.scrollHeight;
      const above = height > availableBelow && availableAbove > availableBelow;
      const maxHeight = above ? availableAbove : availableBelow;
      const width = Math.min(panel.current.offsetWidth, innerWidth - gap * 2);
      setStyle({
        position: "fixed",
        left: Math.max(
          gap,
          Math.min(anchor.right - width, innerWidth - width - gap),
        ),
        top: above
          ? Math.max(gap, anchor.top - gap - Math.min(height, maxHeight))
          : anchor.bottom + gap,
        right: "auto",
        width,
        maxWidth: innerWidth - gap * 2,
        maxHeight,
        overflowY: "auto",
        visibility: "visible",
      });
    };
    position();
    const first =
      panel.current?.querySelector<HTMLElement>("input:not(:disabled)") ??
      panel.current?.querySelector<HTMLElement>(
        '[role="menuitem"]:not(:disabled), button:not(:disabled)',
      );
    const focusFrame = requestAnimationFrame(() =>
      first?.focus({ preventScroll: true }),
    );
    const pointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const focus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  return { open, setOpen, close, root, trigger, panel, style };
}
