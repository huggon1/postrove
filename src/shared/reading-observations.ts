import {
  readingDiagnostic,
  type ReadingDiagnostic,
} from "./reading-diagnostics";

/** Known navigation states establish access requirements independently of model output. */
export function observedPageDiagnostic(
  address: string,
): ReadingDiagnostic | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return;
  }
  if (url.protocol !== "https:") return;
  const host = url.hostname;
  if (host === "accounts.google.com") {
    if (/\/consent(?:\/|$)/.test(url.pathname))
      return readingDiagnostic("account_action_required", "access");
    if (/\/challenge\/(?:ipp|totp|selection|sk)(?:\/|$)/.test(url.pathname))
      return readingDiagnostic("verification_required", "access");
    if (
      /^\/(?:v[23]\/)?signin(?:\/|$)|^\/(?:ServiceLogin|AccountChooser)(?:\/|$)/.test(
        url.pathname,
      )
    )
      return readingDiagnostic("login_required", "access");
    return;
  }
  if (
    (host === "google.com" || host.endsWith(".google.com")) &&
    url.pathname.startsWith("/sorry/")
  )
    return readingDiagnostic("verification_required", "access");
  if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) {
    if (
      ["/login", "/i/flow/login"].includes(url.pathname) ||
      (url.pathname === "/i/jf/onboarding/web" &&
        url.searchParams.get("mode") === "login")
    )
      return readingDiagnostic("login_required", "access");
    if (url.pathname === "/account/access")
      return readingDiagnostic("account_action_required", "access");
  }
  if (
    (host === "reddit.com" || host.endsWith(".reddit.com")) &&
    /^\/(?:login|register)(?:\/|$)/.test(url.pathname)
  )
    return readingDiagnostic("login_required", "access");
}

export function transcriptDiagnostic(reason: string): ReadingDiagnostic {
  if (reason === "transcript_runtime_unavailable")
    return readingDiagnostic("component_missing", "readiness");
  if (reason === "need_login_subtitle" || reason === "bilibili_login_required")
    return readingDiagnostic("login_required", "captions", {
      failureCode: reason,
    });
  const httpStatus = /^bilibili_http_([1-5][0-9]{2})$/.exec(reason)?.[1];
  if (httpStatus)
    return readingDiagnostic("http_error", "captions", {
      httpStatus: Number(httpStatus),
    });
  if (
    reason === "transcript_captions_missing" ||
    reason === "bilibili_subtitles_unavailable"
  )
    return readingDiagnostic("captions_missing", "captions");
  const failureCode =
    /^(?:transcript_|bilibili_|invalid_|empty_)[a-zA-Z0-9_.-]*$/.test(reason) &&
    reason.length <= 64
      ? reason
      : undefined;
  return readingDiagnostic(
    "unknown",
    "captions",
    failureCode ? { failureCode } : undefined,
  );
}
