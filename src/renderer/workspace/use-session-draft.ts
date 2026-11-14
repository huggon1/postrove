import { useState, type SetStateAction } from "react";

// Drafts belong to this renderer session. Credentials stay in memory and leave
// with the window; saved application state keeps its existing Main-process path.
const drafts = new Map<string, unknown>();

export const hasSessionDraft = (key: string) => drafts.has(key);

export function useSessionDraft<T>(key: string, initial: T | (() => T)) {
  const create = () =>
    typeof initial === "function" ? (initial as () => T)() : initial;
  const [value, setValue] = useState<T>(() =>
    drafts.has(key) ? (drafts.get(key) as T) : create(),
  );
  const update = (next: SetStateAction<T>) => {
    setValue((previous) => {
      const value =
        typeof next === "function"
          ? (next as (previous: T) => T)(previous)
          : next;
      drafts.set(key, value);
      return value;
    });
  };
  const discard = () => {
    drafts.delete(key);
    setValue(create());
  };
  return [value, update, discard] as const;
}
