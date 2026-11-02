import type { Language } from "./language";
import type { ReadingDiagnostic } from "./reading-diagnostics";

// Required state feedback for an observed reading failure; recovery actions stay structured.
export function readingDiagnosticMessage(
  diagnostic: ReadingDiagnostic,
  language: Language,
): string {
  const messages: Record<ReadingDiagnostic["code"], [string, string]> = {
    login_required: ["来源页面要求登录", "The source page requires sign-in"],
    verification_required: [
      "来源页面要求验证",
      "The source page requires verification",
    ],
    account_action_required: [
      "来源页面要求账号操作",
      "The source page requires account action",
    ],
    source_unavailable: [
      "来源暂时不可读",
      "The source is currently unavailable",
    ],
    access_parameters_missing: [
      "链接缺少访问参数，请提供完整分享链接",
      "Access parameters are missing; provide the full share link",
    ],
    captions_missing: [
      "来源未提供可用字幕",
      "The source has no available captions",
    ],
    content_not_supported: [
      "此内容类型尚未接入",
      "This content type is not supported yet",
    ],
    component_missing: ["读取组件缺失", "The reading component is missing"],
    component_unavailable: [
      "读取组件连接失败",
      "The reading component connection failed",
    ],
    model_not_ready: ["模型连接尚未就绪", "The model connection is not ready"],
    model_failed: ["模型处理失败", "Model processing failed"],
    network_failed: ["网络连接失败", "The network connection failed"],
    http_error: ["读取请求失败", "The reading request failed"],
    page_parse_failed: ["页面解析失败", "Page parsing failed"],
    capture_incomplete: [
      "来源正文尚未获取",
      "The source body has not been captured",
    ],
    processing_failed: ["材料处理未完成", "Material processing is incomplete"],
    unknown: ["来源读取未完成", "Source reading is incomplete"],
  };
  if (diagnostic.evidence?.platformCode === "300031")
    return language === "en"
      ? "Xiaohongshu source is currently unavailable (300031: 当前笔记暂时无法浏览)."
      : "小红书来源暂不可读（300031：当前笔记暂时无法浏览）";
  return (
    messages[diagnostic.code][language === "en" ? 1 : 0] +
    (diagnostic.evidence?.httpStatus
      ? ` (HTTP ${diagnostic.evidence.httpStatus})`
      : "")
  );
}
