import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleNotch,
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

export function ModelSettings() {
  const [view, setView] = useState<ModelView>();
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
  useEffect(() => {
    let active = true,
      version = 0;
    const load = async () => {
      const revision = ++version;
      try {
        const reply = await bridge.modelView();
        if (!active || revision !== version) return;
        if (reply.ok) setView(reply.value);
        else setError(reply.message);
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
  async function action(operation: () => Promise<ModelReply<unknown>>) {
    setBusy(true);
    setError("");
    try {
      const reply = await operation();
      if (!reply.ok) setError(reply.message);
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
    if (view?.auth === "logging_in") void bridge.cancelModelLogin();
    setEditing(false);
    setAnswer("");
    setError("");
  };
  const checkStatus =
    view?.check === "running"
      ? t("检查中…")
      : view?.check === "passed" && view.checkIsCurrent
        ? t("连接检查通过")
        : view?.check === "failed"
          ? t(
              view.checkFailure
                ? failureMessages[view.checkFailure]
                : "模型检查失败，请重试。",
            )
          : "";
  return (
    <section className="model-settings" aria-label={t("后台模型")}>
      <SectionHeading
        title={t("后台模型")}
        action={
          <button
            className="primary small-primary"
            onClick={() => {
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
      <div className="model-connection-list">
        {view?.connections.map((connection) => {
          const current =
            view.current?.method === "pi" &&
            view.current.connectionId === connection.id;
          return (
            <article
              className={`model-connection-card ${current ? "current" : ""}`}
              key={connection.id}
            >
              <div className="model-connection-heading">
                <span className="model-connection-icon">
                  <Sparkle />
                </span>
                <div className="model-connection-name">
                  <h3>{connection.name}</h3>
                  <p>
                    {connection.providerId} · {connection.modelId}
                  </p>
                </div>
                {current && (
                  <span className="connection-pill connected">
                    <i />
                    {t("正在使用")}
                  </span>
                )}
              </div>
              <div className="model-connection-actions">
                <button
                  className="text-button"
                  aria-label={t("编辑连接")}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await action(() =>
                        bridge.selectModelConnection({
                          connectionId: connection.id,
                          providerId: connection.providerId,
                        }),
                      )
                    ) {
                      setEditing(true);
                      setStep(2);
                    }
                  }}
                >
                  {t("编辑")}
                  <ArrowRight />
                </button>
                <button
                  className="text-button danger-text"
                  aria-label={t("移除连接")}
                  disabled={busy}
                  onClick={() => setRemoving(connection.id)}
                >
                  {t("移除")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {view?.migration && (
        <article className="model-connection-card migration-card">
          <Sparkle />
          <div>
            <h3>{t("Codex 订阅")}</h3>
            <p>{view.current?.modelId}</p>
          </div>
          <button
            className="secondary"
            onClick={async () => {
              if (
                await action(() =>
                  bridge.selectModelConnection({ providerId: "openai-codex" }),
                )
              ) {
                setEditing(true);
                setStep(1);
              }
            }}
          >
            {t("迁移连接")}
            <ArrowRight />
          </button>
        </article>
      )}
      {view && !view.current && !view.connections.length && (
        <div className="settings-empty">
          <Sparkle />
          <h3>{t("尚未连接模型")}</h3>
        </div>
      )}
      {view?.current && (
        <div className="model-check-row">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action(
                view.check === "running"
                  ? bridge.cancelModelCheck
                  : bridge.checkModel,
              )
            }
          >
            <ShieldCheck />
            {t(view.check === "running" ? "取消连接检查" : "检查连接")}
          </button>
          {checkStatus &&
            (view.check === "running" ? (
              <span role="status">{checkStatus}</span>
            ) : (
              <Feedback error={view.check === "failed"}>{checkStatus}</Feedback>
            ))}
        </div>
      )}
      {error && !editing && !removing && <Feedback error>{error}</Feedback>}
      {editing && (
        <Modal
          label={t("模型连接配置")}
          className="connection-modal model-modal"
          onClose={close}
        >
          <ModalHeader title={t("模型连接配置")} onClose={close} />
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
                      {view?.providers.map((item) => (
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
                  {t("保存连接")}
                  <Check />
                </button>
              </>
            )}
            {error && <Feedback error>{error}</Feedback>}
            <footer className="setup-footer">
              {step > 0 && (
                <button
                  className="text-button"
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  {t("上一步")}
                </button>
              )}
              <button className="text-button" onClick={close}>
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
          onClose={() => setRemoving(undefined)}
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
