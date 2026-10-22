import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleNotch,
  DotsThree,
  Plus,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import {
  defaultPiOptions,
  type ModelReply,
  type ModelView,
  type PiOptions,
  type ThinkingChoice,
} from "../../shared/model-contracts";
import { failureMessages } from "../../shared/task-failure";
import { bridge } from "../bridge";
import { t } from "../i18n";
import { Modal, ModalHeader } from "../workspace/ui";
import {
  ConfirmDialog,
  Feedback,
  SectionHeading,
  SecretField,
  SetupSteps,
} from "../workspace/forms";

const customTemplate = JSON.stringify(
  {
    providers: {
      "my-provider": {
        name: "My provider",
        baseUrl: "https://api.example.com/v1",
        api: "openai-completions",
        models: [
          {
            id: "my-model",
            name: "My model",
            reasoning: false,
            input: ["text"],
            contextWindow: 32768,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  },
  null,
  2,
);

function jsonObject(value: string): PiOptions["apiOptions"] {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
    throw new Error();
  return parsed as PiOptions["apiOptions"];
}

function ConnectionMenu({
  busy,
  onEdit,
  onRemove,
}: {
  busy: boolean;
  onEdit(): void;
  onRemove(): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const invoke = (operation: () => void) => {
    trigger.current?.focus();
    setOpen(false);
    operation();
  };
  return (
    <div
      className="model-connection-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          if (!open) {
            if (!busy) setOpen(true);
            return;
          }
          const items = [
            ...root.current!.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]',
            ),
          ];
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={t("连接操作")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) setOpen(!open);
        }}
      >
        <DotsThree />
      </button>
      {open && (
        <div
          id={id}
          className="model-connection-menu-items"
          role="menu"
          aria-label={t("连接操作")}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => invoke(onEdit)}
          >
            {t("编辑配置")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-text"
            disabled={busy}
            onClick={() => invoke(onRemove)}
          >
            {t("移除连接")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ModelSettings() {
  const [view, setView] = useState<ModelView>();
  const [editingConnectionId, setEditingConnectionId] = useState<string>();
  const [editing, setEditing] = useState(false),
    [step, setStep] = useState(0),
    [providerId, setProviderId] = useState("");
  const [connectionMode, setConnectionMode] = useState<"builtin" | "custom">(
    "builtin",
  );
  const [modelId, setModelId] = useState(""),
    [name, setName] = useState("");
  const [options, setOptions] = useState<PiOptions>(defaultPiOptions),
    [apiJson, setApiJson] = useState("{}");
  const [answer, setAnswer] = useState(""),
    [customJson, setCustomJson] = useState(customTemplate),
    [customProvider, setCustomProvider] = useState("my-provider");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [removing, setRemoving] = useState<string>();
  const [errorConnectionId, setErrorConnectionId] = useState<string>();
  useEffect(() => {
    let active = true,
      version = 0;
    const load = async () => {
      const revision = ++version;
      try {
        const reply = await bridge.modelView();
        if (!active || revision !== version) return;
        if (reply.ok) setView(reply.value);
        else setError(t(reply.message));
      } catch {
        if (active) setError(t("无法读取模型连接"));
      }
    };
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      active = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!view?.selected) return;
    setModelId(view.selected.modelId ?? "");
    setName(view.selected.name);
    setOptions(view.selected.options);
    setApiJson(JSON.stringify(view.selected.options.apiOptions, null, 2));
  }, [view?.selected?.id, editing]);
  useEffect(() => setAnswer(""), [view?.authPrompt?.id]);
  async function action(
    operation: () => Promise<ModelReply<unknown>>,
    connectionId?: string,
  ) {
    setBusy(true);
    setError("");
    setErrorConnectionId(connectionId);
    try {
      const reply = await operation();
      if (!reply.ok) setError(t(reply.message));
      return reply.ok;
    } catch {
      setError(t("操作未完成，请重试"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const selected = view?.selected;
  const provider = view?.providers.find(
    (item) => item.id === selected?.providerId,
  );
  const model = view?.models.find((item) => item.id === modelId);
  const prompt = view?.authPrompt;
  let advanced = false;
  try {
    advanced = Object.keys(JSON.parse(apiJson)).length > 0;
  } catch {
    advanced = true;
  }
  const update = <K extends keyof PiOptions>(key: K, value: PiOptions[K]) =>
    setOptions((old) => ({ ...old, [key]: value }));
  async function save() {
    if (!selected) return;
    let apiOptions: PiOptions["apiOptions"];
    try {
      apiOptions = jsonObject(apiJson);
    } catch {
      setError(t("请填写有效的 JSON 对象"));
      return;
    }
    if (
      await action(() =>
        bridge.saveModel({
          method: "pi",
          connectionId: selected.id,
          modelId,
          name,
          options: { ...options, apiOptions },
        }),
      )
    )
      setEditing(false);
  }
  const close = () => {
    if (busy) return;
    if (view?.auth === "logging_in") void bridge.cancelModelLogin();
    setEditing(false);
    setAnswer("");
    setError("");
  };
  const checkIsCurrent =
    view?.checkIsCurrent &&
    view.checkConnectionId === view.current?.connectionId &&
    view.checkModelId === view.current?.modelId;
  const checkStatus = !checkIsCurrent
    ? ""
    : view?.check === "running"
      ? t("检查中…")
      : view?.check === "passed"
        ? t("连接检查通过")
        : view?.check === "failed"
          ? t(
              view.checkFailure
                ? failureMessages[view.checkFailure]
                : "模型检查失败，请重试。",
            )
          : view?.check === "cancelled"
            ? t("检查已取消")
            : "";
  const editingTitle = t(editingConnectionId ? "编辑配置" : "模型连接配置");
  const editConnection = async (
    connection: ModelView["connections"][number],
  ) => {
    if (
      await action(
        () =>
          bridge.selectModelConnection({
            connectionId: connection.id,
            providerId: connection.providerId,
          }),
        connection.id,
      )
    ) {
      setEditingConnectionId(connection.id);
      setStep(2);
      setEditing(true);
    }
  };
  return (
    <section className="model-settings" aria-label={t("后台模型")}>
      <SectionHeading
        title={t("后台模型")}
        action={
          <button
            className="primary small-primary"
            disabled={busy}
            onClick={() => {
              setEditingConnectionId(undefined);
              setEditing(true);
              setStep(0);
              setConnectionMode("builtin");
              setProviderId("");
              setError("");
            }}
          >
            <Plus />
            {t("新建连接")}
          </button>
        }
      />
      <div className="model-connection-list" aria-busy={busy}>
        {view?.connections.map((connection) => {
          const current =
            view.current?.method === "pi" &&
            view.current.connectionId === connection.id;
          return (
            <article
              className={`model-connection-card ${current ? "current" : ""}`}
              aria-label={connection.name}
              key={connection.id}
            >
              <div className="model-connection-heading">
                <span className="model-connection-icon">
                  <Sparkle />
                </span>
                <div className="model-connection-name">
                  <h3>{connection.name}</h3>
                  <p>
                    {connection.providerId}
                    {!current && ` · ${connection.modelId}`}
                  </p>
                </div>
                {current && (
                  <span className="connection-pill model-current-pill">
                    <i />
                    {t("正在使用")}
                  </span>
                )}
                <ConnectionMenu
                  busy={busy}
                  onEdit={() => void editConnection(connection)}
                  onRemove={() => {
                    setError("");
                    setRemoving(connection.id);
                  }}
                />
              </div>
              {current ? (
                <>
                  <label className="config-field model-current-model">
                    <span>{t("当前模型")}</span>
                    <select
                      aria-label={t("当前模型")}
                      value={connection.modelId}
                      disabled={busy}
                      onChange={(event) =>
                        void action(
                          () =>
                            bridge.activateModelConnection({
                              connectionId: connection.id,
                              modelId: event.target.value,
                            }),
                          connection.id,
                        )
                      }
                    >
                      {!view.currentModels.some(
                        (item) => item.id === connection.modelId,
                      ) && (
                        <option value={connection.modelId} disabled>
                          {connection.modelId} · {t("目录已变化")}
                        </option>
                      )}
                      {view.currentModels.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={!item.compatible}
                        >
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="model-check-row">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          view.check === "running"
                            ? bridge.cancelModelCheck
                            : bridge.checkModel,
                          connection.id,
                        )
                      }
                    >
                      {view.check === "running" ? (
                        <CircleNotch className="spin" />
                      ) : (
                        <ShieldCheck />
                      )}
                      {t(
                        view.check === "running" ? "取消连接检查" : "检查连接",
                      )}
                    </button>
                    {checkStatus &&
                      (view.check === "running" ||
                      view.check === "cancelled" ? (
                        <span role="status">{checkStatus}</span>
                      ) : (
                        <Feedback error={view.check === "failed"}>
                          {checkStatus}
                        </Feedback>
                      ))}
                  </div>
                </>
              ) : (
                <div className="model-connection-actions">
                  <button
                    className="secondary model-use-button"
                    disabled={busy}
                    onClick={() =>
                      void action(
                        () =>
                          bridge.activateModelConnection({
                            connectionId: connection.id,
                          }),
                        connection.id,
                      )
                    }
                  >
                    {t("使用此连接")}
                  </button>
                </div>
              )}
              {error &&
                errorConnectionId === connection.id &&
                !editing &&
                !removing && <Feedback error>{error}</Feedback>}
            </article>
          );
        })}
      </div>
      {view && !view.current && !view.connections.length && (
        <div className="settings-empty">
          <Sparkle />
          <h3>{t("尚未连接模型")}</h3>
        </div>
      )}
      {error && !errorConnectionId && !editing && !removing && (
        <Feedback error>{error}</Feedback>
      )}
      {editing && (
        <Modal
          label={editingTitle}
          className="connection-modal model-modal"
          onClose={close}
        >
          <ModalHeader title={editingTitle} onClose={close} />
          <div className="model-workspace">
            <SetupSteps
              items={[t("连接方式"), t("认证"), t("模型与参数")]}
              current={step}
            />
            {step === 0 && (
              <>
                <div
                  className="setup-mode model-connection-mode"
                  role="group"
                  aria-label={t("连接方式")}
                >
                  <button
                    type="button"
                    aria-pressed={connectionMode === "builtin"}
                    disabled={busy}
                    onClick={() => {
                      setConnectionMode("builtin");
                      setError("");
                    }}
                  >
                    {t("内置供应商")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={connectionMode === "custom"}
                    disabled={busy}
                    onClick={() => {
                      setConnectionMode("custom");
                      setError("");
                    }}
                  >
                    {t("自定义服务")}
                  </button>
                </div>
                {connectionMode === "builtin" ? (
                  <label className="config-field">
                    <span>{t("供应商")}</span>
                    <select
                      aria-label={t("供应商")}
                      value={providerId}
                      disabled={busy}
                      onChange={(event) => setProviderId(event.target.value)}
                    >
                      <option value="">{t("选择供应商")}</option>
                      {view?.providers
                        .filter((item) => item.builtin)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="config-field">
                      <span>{t("供应商 ID")}</span>
                      <input
                        value={customProvider}
                        disabled={busy}
                        onChange={(event) =>
                          setCustomProvider(event.target.value)
                        }
                      />
                    </label>
                    <label className="config-field">
                      <span>models.json</span>
                      <textarea
                        aria-label="Pi models.json"
                        className="code-input"
                        rows={10}
                        value={customJson}
                        disabled={busy}
                        onChange={(event) => setCustomJson(event.target.value)}
                      />
                    </label>
                  </>
                )}
                <button
                  className="primary full-width"
                  disabled={
                    busy ||
                    (connectionMode === "builtin"
                      ? !providerId
                      : !customProvider.trim() || !customJson.trim())
                  }
                  onClick={async () => {
                    if (connectionMode === "custom") {
                      try {
                        jsonObject(customJson);
                      } catch {
                        setError(t("请填写有效的 JSON 对象"));
                        return;
                      }
                      if (
                        await action(() =>
                          bridge.configureModelCatalog({
                            providerId: customProvider,
                            modelsJson: customJson,
                          }),
                        )
                      )
                        setStep(1);
                    } else if (
                      await action(() =>
                        bridge.selectModelConnection({ providerId }),
                      )
                    )
                      setStep(1);
                  }}
                >
                  {t("继续")}
                  <ArrowRight />
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <div className="model-auth-heading">
                  <ShieldCheck />
                  <h3>{provider?.name || selected?.providerId}</h3>
                </div>
                <div className="config-actions">
                  {view?.auth === "logging_in" ? (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void action(bridge.cancelModelLogin)}
                    >
                      {t("取消登录")}
                    </button>
                  ) : (
                    provider?.authMethods.map((method) => (
                      <button
                        className="secondary"
                        disabled={busy}
                        key={method.type}
                        onClick={() =>
                          void action(() =>
                            bridge.loginModel({ authType: method.type }),
                          )
                        }
                      >
                        {method.name}
                      </button>
                    ))
                  )}
                </div>
                {view?.authEvents.map((event, index) => (
                  <div className="auth-event" key={index}>
                    {event.type === "auth_url" ? (
                      <>
                        {event.instructions && <p>{event.instructions}</p>}
                        <button
                          className="secondary"
                          onClick={() =>
                            void action(() =>
                              bridge.openModelAuthUrl(event.url),
                            )
                          }
                        >
                          {t("打开认证页面")}
                        </button>
                      </>
                    ) : event.type === "device_code" ? (
                      <>
                        <p>
                          {t("在认证页面输入此代码")}{" "}
                          <strong>{event.userCode}</strong>
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            void action(() =>
                              bridge.openModelAuthUrl(event.verificationUri),
                            )
                          }
                        >
                          {t("打开认证页面")}
                        </button>
                      </>
                    ) : (
                      <>
                        <p>{event.message}</p>
                        {event.links?.map((link) => (
                          <button
                            className="text-button"
                            key={link.url}
                            onClick={() =>
                              void action(() =>
                                bridge.openModelAuthUrl(link.url),
                              )
                            }
                          >
                            {link.label || t("打开认证页面")}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                ))}
                {prompt && (
                  <form
                    className="model-auth-prompt"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = answer;
                      setAnswer("");
                      void action(() =>
                        bridge.respondModelAuth({ id: prompt.id, value }),
                      );
                    }}
                  >
                    {prompt.type === "secret" ? (
                      <SecretField
                        label={prompt.message}
                        autoFocus
                        value={answer}
                        placeholder={prompt.placeholder}
                        onChange={(event) => setAnswer(event.target.value)}
                      />
                    ) : (
                      <label className="config-field">
                        <span>{prompt.message}</span>
                        {prompt.type === "select" ? (
                          <select
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                          >
                            <option value="">{t("请选择")}</option>
                            {prompt.options?.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            autoComplete="off"
                            autoFocus
                            value={answer}
                            placeholder={prompt.placeholder}
                            onChange={(event) => setAnswer(event.target.value)}
                          />
                        )}
                      </label>
                    )}
                    <button
                      className="primary"
                      type="submit"
                      disabled={busy || !answer}
                    >
                      {t("继续认证")}
                    </button>
                  </form>
                )}
                <div className="auth-state" role="status">
                  {view?.auth === "signed_in" ? (
                    <>
                      <CheckCircleIcon />
                      {t("认证已配置")}
                    </>
                  ) : view?.auth === "logging_in" ? (
                    <>
                      <CircleNotch className="spin" />
                      {t("认证中…")}
                    </>
                  ) : (
                    t("请完成认证")
                  )}
                </div>
                {view?.authFailure && (
                  <Feedback error>{t("认证未完成，请重试")}</Feedback>
                )}
                {view?.catalog === "failed" && (
                  <Feedback error>{t("模型目录刷新失败")}</Feedback>
                )}
                {view?.auth === "signed_in" && (
                  <button
                    className="primary full-width"
                    disabled={busy}
                    onClick={() => setStep(2)}
                  >
                    {t("继续")}
                    <ArrowRight />
                  </button>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <label className="config-field">
                  <span>{t("连接名称")}</span>
                  <input
                    aria-label={t("连接名称")}
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="config-field">
                  <span>{t("模型")}</span>
                  <select
                    aria-label={t("模型")}
                    value={modelId}
                    disabled={busy}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    <option value="">{t("选择模型")}</option>
                    {modelId && !model && (
                      <option value={modelId} disabled>
                        {modelId} · {t("目录已变化")}
                      </option>
                    )}
                    {view?.models.map((item) => (
                      <option
                        value={item.id}
                        key={item.id}
                        disabled={!item.compatible}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="reasoning-fields">
                  {(["browser", "reading"] as const).map((role) => {
                    const key =
                      role === "browser"
                        ? "browserThinking"
                        : "readingThinking";
                    return (
                      <label className="config-field" key={role}>
                        <span>
                          {t(
                            role === "browser"
                              ? "浏览任务 Reasoning"
                              : "阅读任务 Reasoning",
                          )}
                        </span>
                        <select
                          aria-label={t(
                            role === "browser"
                              ? "浏览任务 Reasoning"
                              : "阅读任务 Reasoning",
                          )}
                          value={options[key]}
                          disabled={busy || !model || advanced}
                          onChange={(event) =>
                            update(key, event.target.value as ThinkingChoice)
                          }
                        >
                          <option value="task_default">{t("任务默认")}</option>
                          {options[key] !== "task_default" &&
                            !model?.thinkingLevels.includes(options[key]) && (
                              <option value={options[key]} disabled>
                                {options[key]}
                              </option>
                            )}
                          {model?.thinkingLevels.map((level) => (
                            <option key={level}>{level}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <details className="config-details">
                  <summary>{t("更多任务参数")}</summary>
                  <div className="parameter-grid">
                    <label className="config-field">
                      <span>Temperature</span>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={options.temperature ?? ""}
                        onChange={(event) =>
                          update(
                            "temperature",
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label className="config-field">
                      <span>{t("最大输出 token")}</span>
                      <input
                        type="number"
                        min="1"
                        value={options.maxTokens ?? ""}
                        onChange={(event) =>
                          update(
                            "maxTokens",
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label className="config-field">
                      <span>{t("传输方式")}</span>
                      <select
                        value={options.transport}
                        onChange={(event) =>
                          update(
                            "transport",
                            event.target.value as PiOptions["transport"],
                          )
                        }
                      >
                        {["auto", "sse", "websocket", "websocket-cached"].map(
                          (item) => (
                            <option key={item}>{item}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="config-field">
                      <span>{t("缓存偏好")}</span>
                      <select
                        value={options.cacheRetention}
                        onChange={(event) =>
                          update(
                            "cacheRetention",
                            event.target.value as PiOptions["cacheRetention"],
                          )
                        }
                      >
                        {["none", "short", "long"].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>
                <details className="config-details">
                  <summary>{t("高级 API 参数")}</summary>
                  <label className="config-field">
                    <span>Pi API options JSON</span>
                    <textarea
                      aria-label="Pi API options JSON"
                      className="code-input"
                      rows={7}
                      value={apiJson}
                      onChange={(event) => {
                        setApiJson(event.target.value);
                        setError("");
                      }}
                    />
                  </label>
                  {advanced && (
                    <p className="auth-state">{t("Reasoning 由 JSON 控制")}</p>
                  )}
                </details>
                <button
                  className="primary full-width"
                  disabled={
                    busy ||
                    !model?.compatible ||
                    !name.trim() ||
                    view?.auth !== "signed_in"
                  }
                  onClick={() => void save()}
                >
                  {t(editingConnectionId ? "保存连接" : "保存并使用")}
                  <Check />
                </button>
              </>
            )}
            {error && <Feedback error>{error}</Feedback>}
            <footer className="setup-footer">
              {step > (editingConnectionId ? 1 : 0) && (
                <button
                  className="text-button"
                  disabled={busy || view?.auth === "logging_in"}
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  {t("上一步")}
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={close}>
                {t("取消")}
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {removing && (
        <ConfirmDialog
          title={t("移除模型连接")}
          confirmLabel={t("移除")}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setRemoving(undefined);
              setError("");
            }
          }}
          onConfirm={async () => {
            if (
              await action(() =>
                bridge.removeModelConnection({ connectionId: removing }),
              )
            )
              setRemoving(undefined);
          }}
        >
          {
            view?.connections.find((connection) => connection.id === removing)
              ?.name
          }
        </ConfirmDialog>
      )}
    </section>
  );
}
const CheckCircleIcon = () => <Check />;
