import type { Page } from "playwright-core";
import { classifyXhsFailure, xhsNoteIdentity } from "./xiaohongshu-media";
import type { XhsVideoContext } from "./xiaohongshu-video";

/** Reads only the task page's own note state and its matching document. */
export async function readXhsVideoContext(
  page: Page,
  url: string,
  signal: AbortSignal,
): Promise<XhsVideoContext> {
  if (signal.aborted) throw new Error("Cancelled");
  const identity = xhsNoteIdentity(url);
  if (!identity || xhsNoteIdentity(page.url())?.id !== identity.id)
    throw new Error("xiaohongshu_identity_changed");
  const data = await page.evaluate((id) => {
    const state = (
      window as unknown as {
        __INITIAL_STATE__?: {
          note?: {
            noteDetailMap?: Record<string, { note?: Record<string, unknown> }>;
          };
        };
      }
    ).__INITIAL_STATE__;
    const note = state?.note?.noteDetailMap?.[id]?.note;
    const own = document.querySelector(
      '.note-container .note-content,#detail-desc,article,[role="article"]',
    );
    const user = note?.user as Record<string, unknown> | undefined;
    const images = Array.isArray(note?.imageList)
      ? note.imageList.slice(0, 30).map((item) => {
          const image = item as Record<string, unknown>;
          return String(image.urlDefault || image.urlPre || "").slice(0, 4096);
        })
      : [];
    return {
      url: location.href,
      navigationUrl: performance.getEntriesByType("navigation")[0]?.name,
      own: !!own,
      noteId: String(note?.noteId ?? ""),
      title: typeof note?.title === "string" ? note.title.slice(0, 500) : "",
      description:
        typeof note?.desc === "string" ? note.desc.slice(0, 300_000) : "",
      uploader: String(user?.nickname || user?.nick_name || "").slice(0, 300),
      images,
      challenge: own && note?.noteId === id ? "" : (document.body?.innerText || "").slice(0, 8000),
    };
  }, identity.id);
  if (signal.aborted) throw new Error("Cancelled");
  if (
    xhsNoteIdentity(page.url())?.id !== identity.id ||
    xhsNoteIdentity(data.url)?.id !== identity.id ||
    xhsNoteIdentity(data.navigationUrl || "")?.id !== identity.id
  )
    throw new Error("xiaohongshu_identity_changed");
  const result: XhsVideoContext = {
    cookies: await page.context().cookies([identity.requestUrl]),
  };
  if (data.own && data.noteId === identity.id)
    result.fallback = {
      id: identity.id,
      title: data.title,
      description: data.description,
      uploader: data.uploader,
      images: data.images.flatMap((raw) => {
        try {
          const image = new URL(raw);
          return image.protocol === "https:" &&
            !image.username &&
            !image.password
            ? [{ url: image.href, alt: "Video cover" }]
            : [];
        } catch {
          return [];
        }
      }),
    };
  const failure = classifyXhsFailure(data.challenge);
  if (
    [
      "login_required",
      "verification_required",
      "access_parameters_invalid",
      "source_unavailable",
    ].includes(failure)
  )
    result.accessIssue = failure as XhsVideoContext["accessIssue"];
  return result;
}
