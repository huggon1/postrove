import { platformConnections } from "../../shared/advisor-contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import { t } from "../i18n";
import type { PlatformAccountStatus } from "../../shared/ipc-contracts";

export type PlatformStatus = Partial<PlatformAccountStatus> & {
  state: "loading" | "ready" | "error";
  error?: string;
};
export function platformStatusLabel(status?: PlatformStatus) {
  if (status?.state === "error") return t("读取失败");
  if (status?.signedIn === undefined) return t("正在读取…");
  return t(status.signedIn ? "已连接" : "未连接");
}
export function usePlatformStatus() {
  const [status, setStatus] = useState<Record<string, PlatformStatus>>({});
  const alive = useRef(true),
    revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current;
    setStatus((old) =>
      Object.fromEntries(
        platformConnections.map(({ id }) => [
          id,
          { ...old[id], state: "loading" as const },
        ]),
      ),
    );
    const results = await Promise.allSettled(
      platformConnections.map((connection) =>
        bridge.platformStatus(connection.id),
      ),
    );
    if (!alive.current || revision.current !== current) return;
    setStatus((old) =>
      Object.fromEntries(
        results.map((result, index) => {
          const id = platformConnections[index].id;
          if (result.status === "fulfilled" && result.value.ok)
            return [id, { ...result.value.value, state: "ready" as const }];
          return [
            id,
            { ...old[id], state: "error" as const, error: t("状态读取失败") },
          ];
        }),
      ),
    );
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      alive.current = false;
      revision.current++;
      off();
    };
  }, [load]);
  return [status, setStatus, load] as const;
}
