import { platformConnections } from "../../shared/advisor-contracts";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import { t } from "../i18n";

export function usePlatformStatus() {
  const [status, setStatus] = useState<
    Record<string, { signedIn: boolean; installed: boolean; error?: string }>
  >({});
  useEffect(() => {
    let alive = true,
      revision = 0;
    const load = async () => {
      const current = ++revision;
      const results = await Promise.allSettled([
        ...platformConnections.map((connection) =>
          bridge.platformStatus(connection.id),
        ),
      ]);
      if (!alive || revision !== current) return;
      const next: typeof status = {};
      results.forEach((result, index) => {
        const id = platformConnections[index].id;
        if (result.status === "fulfilled" && result.value.ok) {
          const value = result.value.value;
          next[id] = {
            signedIn: value.signedIn,
            installed: "installed" in value ? !!value.installed : true,
          };
        } else
          next[id] = {
            signedIn: false,
            installed: true,
            error: t("平台登录操作未完成，请稍后重试"),
          };
      });
      setStatus(next);
    };
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return [status, setStatus] as const;
}
