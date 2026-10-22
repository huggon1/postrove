import { writeFile } from "node:fs/promises";
import { dialog, shell } from "electron";
import { z } from "zod";
import {
  buildPiLogDocument,
  readTaskPiLogPages,
  type PiLogTask,
} from "./pi-log-document";

/** Package native Pi pages intact inside one local HTML document. */
export async function exportTaskPiLogs(
  traceRoots: string[],
  taskId: string,
  runIds: string[] = [],
  task?: PiLogTask,
): Promise<string | undefined> {
  const id = z.string().uuid().parse(taskId);
  const sessions = await readTaskPiLogPages(traceRoots, id, runIds);
  if (!sessions.length) throw new Error("该任务尚无可导出的 Pi 会话记录");
  const title = task?.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .slice(0, 64);
  const selected = await dialog.showSaveDialog({
    title: "导出 Pi 会话记录",
    message:
      "记录包含任务输入、平台回答和浏览器工具记录。请选择可信的本地位置。",
    defaultPath: `Postrove-${title || "任务日志"}-${id.slice(0, 8)}.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (selected.canceled || !selected.filePath) return undefined;
  await writeFile(
    selected.filePath,
    buildPiLogDocument({
      taskId: id,
      task,
      exportedAt: new Date().toISOString(),
      sessions,
    }),
    { mode: 0o600 },
  );
  const error = await shell.openPath(selected.filePath);
  if (error) throw new Error("Pi 记录已导出，请从所选位置打开");
  return selected.filePath;
}
