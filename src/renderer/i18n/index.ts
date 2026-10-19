import { ipcErrorMessages, type IpcErrorCode } from "../../shared/ipc-errors";
import { useSyncExternalStore } from "react";
import catalog from "./en.json";
import type { Language } from "../../shared/language";
let language: Language = "zh-CN";
const listeners = new Set<() => void>();
export function selectLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => language,
  );
}
const dynamicLabels: Array<[RegExp, string]> = [
  [/^开始第 ([1-3]) 次模型请求$/, "Starting model request $1"],
  [/^请求暂时失败，([12]) 秒后重试$/, "Request failed; retrying in $1 seconds"],
];
export function t(text: string): string {
  if (language === "zh-CN") return text;
  const translated = (catalog as Record<string, string>)[text];
  if (translated) return translated;
  for (const [pattern, replacement] of dynamicLabels)
    if (pattern.test(text)) return text.replace(pattern, replacement);
  return text;
}

export function tf(text: string, ...values: unknown[]): string {
  const template =
    language === "en" && values[0] === 1
      ? ((catalog as Record<string, string>)[text + ".one"] ?? t(text))
      : t(text);
  return template.replace(/\{(\d+)\}/g, (_, index) =>
    String(values[Number(index)]),
  );
}

export function errorText(message: string, code?: IpcErrorCode) {
  if (language === "zh-CN") return message;
  return (
    (catalog as Record<string, string>)[message] ??
    ipcErrorMessages[code ?? "operation_failed"].en
  );
}

export function dateTime(value: string, dateOnly = false): string {
  const date = new Date(value);
  return dateOnly
    ? date.toLocaleDateString(language)
    : date.toLocaleString(language);
}
