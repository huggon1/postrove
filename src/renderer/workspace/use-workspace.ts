import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../bridge";
import {
  productUiBridge,
  type UiContentWorkspace,
  type UiSettings,
} from "../product-ui";
import type { AdvisorSettings } from "../../shared/advisor-contracts";
import type {
  FocusSearchReport,
  Follow,
} from "../../shared/focus-search-contracts";
import type { ModelReply } from "../../shared/model-contracts";
import type { ApplicationPreferences } from "../../shared/preferences-contracts";
import { selectLanguage, t } from "../i18n";

type OperationState = { pending: boolean; error: string };
const workspaceScope = "workspace";

export function useWorkspace() {
  const ui = useMemo(() => productUiBridge(), []);
  const [reports, setReports] = useState<FocusSearchReport[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [members, setMembers] = useState<AdvisorSettings>();
  const [content, setContent] = useState<UiContentWorkspace>({
    reports: [],
    tasks: [],
    partialReports: [],
  });
  const [settings, setSettings] = useState<UiSettings>();
  const [preferences, setPreferences] = useState<ApplicationPreferences>({
    language: "en",
    readingLanguage: "app",
    taskBrowserVisible: false,
  });
  const [operations, setOperations] = useState<Record<string, OperationState>>(
    {},
  );
  const [snapshotError, setSnapshotError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0),
    alive = useRef(true);
  const inFlight = useRef(new Map<string, Promise<ModelReply<unknown>>>());
  const retries = useRef(new Map<string, () => Promise<ModelReply<unknown>>>());
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    const results = await Promise.allSettled([
      bridge.focusSearchReports(),
      bridge.follows(),
      bridge.advisorSettings(),
      ui.uiContent(),
      ui.uiSettings(),
      bridge.preferences(),
    ]);
    if (!alive.current || version !== generation.current) return;
    const setters = [
      setReports,
      setFollows,
      setMembers,
      setContent,
      setSettings,
    ] as ((value: any) => void)[];
    let failure = "";
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failure ||= t("状态读取失败");
        return;
      }
      if (index === 5) {
        const value = result.value as ApplicationPreferences;
        setPreferences(value);
        selectLanguage(value.language);
      } else {
        const reply = result.value as ModelReply<unknown>;
        if (reply.ok) setters[index](reply.value);
        else failure ||= reply.message;
      }
    });
    setSnapshotError(failure);
    setLoading(false);
  }, [ui]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bridge.onChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 120);
    });
    return () => {
      alive.current = false;
      generation.current++;
      clearTimeout(timer);
      off();
    };
  }, [refresh]);
  const execute = useCallback(
    async <T>(
      operation: () => Promise<ModelReply<T>>,
      scope: string,
    ): Promise<ModelReply<T>> => {
      const existing = inFlight.current.get(scope);
      if (existing) return existing as Promise<ModelReply<T>>;
      setOperations((old) => ({
        ...old,
        [scope]: { pending: true, error: "" },
      }));
      retries.current.delete(scope);
      const work = (async (): Promise<ModelReply<T>> => {
        let reply: ModelReply<T>;
        try {
          reply = await operation();
        } catch {
          reply = { ok: false, message: t("操作未完成，请重试") };
        }
        if (reply.ok) await refresh();
        if (alive.current) {
          setOperations((old) => ({
            ...old,
            [scope]: { pending: false, error: reply.ok ? "" : reply.message },
          }));
          if (!reply.ok)
            retries.current.set(
              scope,
              operation as () => Promise<ModelReply<unknown>>,
            );
        }
        return reply;
      })();
      inFlight.current.set(scope, work);
      try {
        return await work;
      } finally {
        if (inFlight.current.get(scope) === work)
          inFlight.current.delete(scope);
      }
    },
    [refresh],
  );
  const run = useCallback(
    async <T>(
      operation: () => Promise<ModelReply<T>>,
      scope = workspaceScope,
    ): Promise<T | undefined> => {
      const reply = await execute(operation, scope);
      return reply.ok ? reply.value : undefined;
    },
    [execute],
  );
  const booleanAction = useCallback(
    async (
      operation: () => Promise<ModelReply<unknown>>,
      scope = workspaceScope,
    ) => (await execute(operation, scope)).ok,
    [execute],
  );
  const clearError = useCallback((scope = workspaceScope) => {
    retries.current.delete(scope);
    setOperations((old) => ({
      ...old,
      [scope]: { pending: old[scope]?.pending ?? false, error: "" },
    }));
    if (scope === workspaceScope) setSnapshotError("");
  }, []);
  const setError = useCallback((message: string) => {
    retries.current.delete(workspaceScope);
    setSnapshotError("");
    setOperations((old) => ({
      ...old,
      [workspaceScope]: {
        pending: old[workspaceScope]?.pending ?? false,
        error: message,
      },
    }));
  }, []);
  const retry = useCallback(
    async (scope = workspaceScope) => {
      const operation = retries.current.get(scope);
      if (operation) return booleanAction(operation, scope);
      if (scope === workspaceScope) await refresh();
      return true;
    },
    [booleanAction, refresh],
  );
  const pending = (scope: string) => !!operations[scope]?.pending;
  const errorFor = (scope: string) => operations[scope]?.error ?? "";
  return {
    reports,
    follows,
    members,
    content,
    settings,
    preferences,
    setPreferences,
    busy: pending(workspaceScope),
    loading,
    error: errorFor(workspaceScope) || snapshotError,
    errorIsRead: !errorFor(workspaceScope) && !!snapshotError,
    setError,
    refresh,
    run,
    booleanAction,
    pending,
    errorFor,
    clearError,
    retry,
    ui,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
