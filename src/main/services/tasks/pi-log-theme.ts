// Palette and control geometry mirror renderer/workspace/workspace.css.
export const piLogPalette = `
  :root {
    --paper: #fff; --canvas: #f6f7f9; --ink: #292d33; --muted: #6c707b;
    --line: #e9eaee; --hover: #f7f8fa; --accent: #3266d8; --red: #a33f50;
    color-scheme: light;
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--ink); background: var(--paper);
  }
`;

export const piLogNativeTheme = `${piLogPalette}
  :root {
    --text: var(--ink); --body-bg: var(--paper); --container-bg: var(--paper);
    --info-bg: var(--canvas); --dim: var(--muted); --border: var(--line);
    --borderAccent: var(--ink); --selectedBg: var(--hover);
    --warning: #8d5d36; --error: var(--red); --success: #536951;
    --userMessageBg: var(--canvas); --userMessageText: var(--ink);
    --thinkingText: var(--muted); --toolOutput: var(--ink);
    --toolPendingBg: var(--canvas); --toolSuccessBg: var(--canvas); --toolErrorBg: #fbefed;
    --customMessageBg: var(--canvas); --customMessageText: var(--ink); --customMessageLabel: var(--muted);
    --mdHeading: var(--ink); --mdLink: var(--accent); --mdCode: var(--ink);
    --mdCodeBlockBorder: var(--line); --mdQuote: var(--muted); --mdQuoteBorder: var(--line);
    --mdHr: var(--line); --mdListBullet: var(--muted);
    --toolDiffAdded: #536951; --toolDiffRemoved: var(--red); --toolDiffContext: var(--muted);
    --syntaxComment: var(--muted); --syntaxFunction: var(--accent); --syntaxKeyword: #795096;
    --syntaxNumber: #8d5d36; --syntaxOperator: var(--ink); --syntaxPunctuation: var(--muted);
    --syntaxString: #536951; --syntaxType: var(--accent); --syntaxVariable: var(--ink);
    --sidebar-width: 280px; --sidebar-min-width: 240px; --line-height: 22px;
  }
  body { font: 14px/1.7 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: var(--ink); background: var(--paper); }
  #sidebar { background: var(--canvas); border-right: 1px solid var(--line); }
  #content { padding: 24px 28px; }
  #content > * { max-width: 844px; }
  .header { padding: 0 0 20px; border-radius: 0; border-bottom: 1px solid var(--line); }
  .header h1 { font: 600 20px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: var(--ink); overflow-wrap: anywhere; }
  .help-bar, .help-hint { color: var(--muted); font-size: 12px; }
  .header-info { margin-top: 10px; font-size: 12px; }
  .postrove-technical { margin-top: 16px; color: var(--muted); font-size: 12px; }
  .postrove-technical summary { cursor: pointer; }
  .sidebar-search { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 12px; }
  .filter-btn, .header-toggle-btn, .download-json-btn, .sidebar-close { border-color: var(--line); border-radius: 10px; padding: 5px 9px; font-size: 12px; }
  .filter-btn.active { background: var(--hover); color: var(--ink); border-color: var(--line); }
  .header-toggle-btn[aria-pressed="true"] { background: var(--canvas); color: var(--ink); border-color: var(--line); font-weight: 500; }
  .tree-node { font-size: 12px; line-height: 22px; }
  .tree-status, .message-timestamp { font-size: 11px; color: var(--muted); }
  .user-message, .tool-execution, .system-prompt, .tools-list { border: 1px solid var(--line); border-radius: 12px; }
  .user-message { padding: 16px 20px; }
  .thinking-text { font-style: normal; font-size: 13px; }
  .tool-header, .tool-name { color: var(--ink); font-weight: 500; }
  pre, code, .tool-output, .tool-command, .tool-path, .system-prompt-full, .system-prompt-preview { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  .tool-output, .assistant-text { line-height: 1.8; }
  .assistant-text h1, .assistant-text h2, .assistant-text h3 { color: var(--ink); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (max-width: 900px) {
    #hamburger { top: 24px; left: 28px; width: 32px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
    .header h1 { padding-left: 44px; min-height: 32px; }
  }
  @media (max-width: 560px) { #content { padding: 20px 16px; } #hamburger { top: 20px; left: 16px; } .help-actions { gap: 6px; } }
`;
