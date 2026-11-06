import { useState } from "react";
import {
  ArrowUpRight,
  ArrowClockwise,
  CircleNotch,
} from "@phosphor-icons/react";
import type { PlatformConnectionId } from "../../shared/advisor-contracts";
import { bridge } from "../bridge";
import { t } from "../i18n";
import { IconButton } from "./ui";

export function PlatformHomeButton({
  connectionId,
  onError,
}: {
  connectionId: PlatformConnectionId | "bilibili";
  onError(message: string): void;
}) {
  const [busy, setBusy] = useState<"home" | "refresh">();
  async function open(refresh = false) {
    setBusy(refresh ? "refresh" : "home");
    onError("");
    try {
      const reply = await (refresh
        ? connectionId === "bilibili"
          ? bridge.refreshReadingSiteAccount(connectionId)
          : bridge.refreshPlatformAccount(connectionId)
        : connectionId === "bilibili"
          ? bridge.openReadingSiteHome(connectionId)
          : bridge.openPlatformHome(connectionId));
      if (!reply.ok) onError(t(reply.message));
    } catch {
      onError(
        t(
          refresh
            ? "账号名称刷新失败，请稍后重试"
            : "平台登录操作未完成，请稍后重试",
        ),
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <span className="platform-account-actions">
      <IconButton
        tooltip
        label={t("打开账号主页")}
        disabled={!!busy}
        onClick={() => void open()}
      >
        {busy === "home" ? <CircleNotch className="spin" /> : <ArrowUpRight />}
      </IconButton>
      <IconButton
        tooltip
        label={t("刷新账号名称")}
        disabled={!!busy}
        onClick={() => void open(true)}
      >
        {busy === "refresh" ? (
          <CircleNotch className="spin" />
        ) : (
          <ArrowClockwise />
        )}
      </IconButton>
    </span>
  );
}
