import { z } from "zod";
import type { BrowserContext, Page } from "playwright-core";
import { createHash } from "node:crypto";

export type LoginSite = "x" | "xiaohongshu" | "gemini" | "reddit" | "bilibili";
export const accountNameSchema = z.string().trim().min(1).max(200);
export const platformAccountSchema = z
  .object({
    name: accountNameSchema,
    handle: accountNameSchema.optional(),
  })
  .strict();
export type PlatformAccount = z.infer<typeof platformAccountSchema>;
export const savedAccountsSchema = z.record(
  z.string(),
  z
    .object({
      session: z.string().regex(/^[a-f0-9]{64}$/),
      account: platformAccountSchema,
    })
    .strict(),
);
const authenticationCookies: Record<LoginSite, string[]> = {
  x: ["auth_token"],
  xiaohongshu: ["web_session"],
  gemini: ["__Secure-1PSID", "__Secure-3PSID", "SID"],
  reddit: ["reddit_session"],
  bilibili: ["SESSDATA"],
};
export const accountHomes: Record<LoginSite, string> = {
  x: "https://x.com/home",
  xiaohongshu: "https://www.xiaohongshu.com/explore",
  gemini: "https://gemini.google.com/app",
  reddit: "https://www.reddit.com/",
  bilibili: "https://www.bilibili.com/",
};
export function accountSession(
  site: LoginSite,
  cookies: { name: string; value: string; domain: string }[],
) {
  const host = new URL(accountHomes[site]).hostname.replace(/^www\./, "");
  const domain = site === "gemini" ? "google.com" : host;
  const values = cookies
    .filter(
      (cookie) =>
        authenticationCookies[site].includes(cookie.name) &&
        (cookie.domain.replace(/^\./, "") === domain ||
          cookie.domain.endsWith(`.${domain}`)),
    )
    .map(({ name, value, domain }) => [name, value, domain])
    .sort();
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

// Only authenticated self controls supply identity. Source authors and page titles
// are deliberately outside this contract.
export async function accountFromPage(
  site: LoginSite,
  page: Page,
): Promise<PlatformAccount | undefined> {
  const url = new URL(page.url());
  const domain =
    site === "gemini"
      ? "google.com"
      : new URL(accountHomes[site]).hostname.replace(/^www\./, "");
  if (
    url.protocol !== "https:" ||
    !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  )
    return;
  const frames = site === "gemini" ? page.frames() : [page.mainFrame()];
  for (const frame of frames) {
    let frameUrl: URL;
    try {
      frameUrl = new URL(frame.url());
    } catch {
      continue;
    }
    if (
      frameUrl.protocol !== "https:" ||
      !(
        frameUrl.hostname === domain || frameUrl.hostname.endsWith(`.${domain}`)
      )
    )
      continue;
    const raw = await frame.evaluate((site) => {
      const text = (element: Element | null) => element?.textContent?.trim();
      if (site === "x") {
        const own = document.querySelector(
          '[data-testid="SideNav_AccountSwitcher_Button"]',
        );
        const lines = (own?.textContent || "").trim();
        const handle = lines.match(/@[\w]+/u)?.[0];
        const name = handle
          ? lines.slice(0, lines.indexOf(handle)).trim()
          : lines;
        const profile = document
          .querySelector('[data-testid="AppTabBar_Profile_Link"]')
          ?.getAttribute("href");
        const ownHandle =
          handle || profile?.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)?.[1];
        return name || ownHandle
          ? {
              name: name || `@${ownHandle}`,
              ...(ownHandle
                ? {
                    handle: ownHandle.startsWith("@")
                      ? ownHandle
                      : `@${ownHandle}`,
                  }
                : {}),
            }
          : undefined;
      }
      if (site === "gemini") {
        const own = Array.from(document.querySelectorAll("[aria-label]")).find(
          (element) =>
            /^(?:Google Account|Google 账号|Google 帐号|Google 账户|Google 帐户|Google 帳戶|Google 帳號)[:：]/i.test(
              element.getAttribute("aria-label") || "",
            ),
        );
        const label = own
          ?.getAttribute("aria-label")
          ?.replace(/^[^:：]+[:：]\s*/, "")
          .trim();
        if (!label) return;
        const email = label.match(
          /[\w.!#$%&'*+\/=?^`{|}~-]+@[\w.-]+\.[a-z]{2,}/i,
        )?.[0];
        const name = label
          .replace(/\([^)]*@[^)]*\)/g, "")
          .replace(email || /$^/, "")
          .trim();
        return {
          name: name || email || label,
          ...(email ? { handle: email } : {}),
        };
      }
      if (site === "xiaohongshu") {
        const state = (
          window as unknown as {
            __INITIAL_STATE__?: { user?: { userInfo?: unknown } };
          }
        ).__INITIAL_STATE__;
        const raw = state?.user?.userInfo as
          | {
              value?: unknown;
              nickname?: unknown;
              nickName?: unknown;
              redId?: unknown;
              red_id?: unknown;
            }
          | undefined;
        const own = (raw?.value || raw) as typeof raw;
        const name = own?.nickname || own?.nickName;
        const handle = own?.redId || own?.red_id;
        if (typeof name === "string")
          return {
            name,
            ...(typeof handle === "string" && handle ? { handle } : {}),
          };
      }
      if (site === "reddit") {
        const own = document.querySelector(
          '[data-testid="user-drawer"] [data-testid="user-name"], #USER_DROPDOWN_ID',
        );
        const name = text(own)?.match(/(?:^|\s)u\/([\w-]+)/)?.[1];
        if (name) return { name, handle: `u/${name}` };
      }
    }, site);
    const parsed = platformAccountSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
}

export async function accountFromSession(
  site: LoginSite,
  context: BrowserContext,
  userAgent?: string,
): Promise<PlatformAccount | undefined> {
  const endpoint =
    site === "bilibili"
      ? "https://api.bilibili.com/x/web-interface/nav"
      : site === "reddit"
        ? "https://www.reddit.com/api/me.json"
        : site === "xiaohongshu"
          ? "https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo"
          : undefined;
  if (!endpoint) return;
  const response = await context.request.get(endpoint, {
    headers: userAgent ? { "User-Agent": userAgent } : {},
    timeout: 5000,
    maxRedirects: 0,
  });
  if (!response.ok()) return;
  const body = await response.json();
  const raw =
    site === "bilibili"
      ? body?.code === 0 && body?.data?.isLogin === true
        ? { name: body.data.uname, handle: String(body.data.mid) }
        : undefined
      : site === "reddit"
        ? body?.data?.name
          ? { name: body.data.name, handle: `u/${body.data.name}` }
          : undefined
        : body?.data?.nickname
          ? {
              name: body.data.nickname,
              ...(body.data.red_id ? { handle: body.data.red_id } : {}),
            }
          : undefined;
  const parsed = platformAccountSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
