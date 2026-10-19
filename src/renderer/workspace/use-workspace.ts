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
    language: "zh-CN",
    readingLanguage: "app",
    taskBrowserVisible: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0),
    alive = useRef(true);
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
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        setError(t("状态读取失败"));
        return;
      }
      if (index === 5) {
        const value = result.value as ApplicationPreferences;
        setPreferences(value);
        selectLanguage(value.language);
      } else {
        const reply = result.value as ModelReply<unknown>;
        if (reply.ok) setters[index](reply.value);
        else setError(reply.message);
      }
    });
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
  async function run<T>(
    operation: () => Promise<ModelReply<T>>,
  ): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      const reply = await operation();
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      await refresh();
      return reply.value;
    } catch {
      setError(t("操作未完成，请重试"));
    } finally {
      setBusy(false);
    }
  }
  const booleanAction = async (
    operation: () => Promise<ModelReply<unknown>>,
  ) => {
    setBusy(true);
    setError("");
    try {
      const reply = await operation();
      if (!reply.ok) setError(reply.message);
      else await refresh();
      return reply.ok;
    } catch {
      setError(t("操作未完成，请重试"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    reports,
    follows,
    members,
    content,
    settings,
    preferences,
    setPreferences,
    busy,
    loading,
    error,
    setError,
    refresh,
    run,
    booleanAction,
    ui,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
