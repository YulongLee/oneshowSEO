"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  FloppyDisk,
  Key,
  LockKey,
  Money,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
type Provider = {
  provider: "alipay" | "wechatpay";
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  configuredFields: number;
  totalFields: number;
  lastTestStatus: string | null;
  lastTestedAt: number | null;
  lastError: string | null;
  fields: {
    key: string;
    label: string;
    required: boolean;
    secret: boolean;
    placeholder?: string;
    configured: boolean;
  }[];
};
export function PaymentProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([]),
    [values, setValues] = useState<Record<string, Record<string, string>>>({}),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [encryptionReady, setEncryptionReady] = useState(false),
    [liveEnabled, setLiveEnabled] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/payment-providers", {
        cache: "no-store",
      }),
      data = await response.json();
    if (response.ok) {
      setProviders(data.providers);
      setEncryptionReady(data.encryptionReady);
      setLiveEnabled(data.liveEnabled);
    } else setMessage(data.error || "读取支付配置失败");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const save = async (item: Provider, enabled: boolean) => {
    setBusy(item.provider);
    setMessage("");
    const response = await fetch("/api/admin/payment-providers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: item.provider,
          enabled,
          values: values[item.provider] || {},
        }),
      }),
      data = await response.json();
    setBusy("");
    if (!response.ok) return setMessage(data.error || "保存失败");
    setValues((current) => ({ ...current, [item.provider]: {} }));
    setMessage(`${item.name} 已${enabled ? "校验并启用" : "安全保存"}`);
    await load();
  };
  const clear = async (item: Provider) => {
    if (!confirm(`确定停用并清除 ${item.name} 配置吗？`)) return;
    setBusy(item.provider);
    const response = await fetch("/api/admin/payment-providers", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: item.provider }),
    });
    setBusy("");
    if (!response.ok) {
      const data = await response.json();
      return setMessage(data.error || "清除失败");
    }
    setMessage(`${item.name} 已停用并清除`);
    await load();
  };
  return (
    <section className="admin-panel data-source-admin payment-provider-admin">
      <div className="admin-panel-title">
        <div>
          <h2>支付与订阅渠道</h2>
          <p>
            统一配置支付宝与微信支付。私钥和 API v3
            密钥仅在服务端加密保存，回调验签成功后才开通套餐与 Credits。
          </p>
        </div>
        <span className={encryptionReady ? "secure-ready" : "secure-warning"}>
          {encryptionReady ? (
            <>
              <LockKey />
              密钥加密已就绪
            </>
          ) : (
            <>
              <WarningCircle />
              需要配置加密主密钥
            </>
          )}
        </span>
      </div>
      {!liveEnabled && (
        <div className="data-source-message">
          <WarningCircle />
          生产支付总开关仍为关闭。可以先保存和校验配置，不会产生真实交易。
        </div>
      )}
      {message && <div className="data-source-message">{message}</div>}
      <div className="data-source-grid">
        {providers.map((item) => (
          <article
            key={item.provider}
            className={item.enabled ? "enabled" : ""}
          >
            <header>
              <span>
                <Money />
              </span>
              <div>
                <strong>{item.name}</strong>
                <p>{item.description}</p>
              </div>
              <em>
                {item.enabled
                  ? liveEnabled
                    ? "可收款"
                    : "已配置·总开关关闭"
                  : item.configured
                    ? "已配置"
                    : "未配置"}
              </em>
            </header>
            <div className="data-source-fields">
              {item.fields.map((field) => (
                <label key={field.key}>
                  <span>
                    {field.label}
                    {field.required && " *"}
                  </span>
                  <div>
                    <Key />
                    <input
                      type={field.secret ? "password" : "text"}
                      autoComplete="new-password"
                      value={values[item.provider]?.[field.key] || ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [item.provider]: {
                            ...current[item.provider],
                            [field.key]: event.target.value,
                          },
                        }))
                      }
                      placeholder={
                        item.configured
                          ? "已安全保存；留空保持不变"
                          : field.placeholder || "请输入配置"
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
            <footer>
              <small>
                {item.configuredFields}/{item.totalFields} 项已保存
              </small>
              <div>
                {item.configured && (
                  <button
                    className="danger-ghost"
                    onClick={() => void clear(item)}
                    disabled={busy === item.provider}
                  >
                    <Trash />
                    停用并清除
                  </button>
                )}
                <button
                  onClick={() => void save(item, false)}
                  disabled={busy === item.provider || !encryptionReady}
                >
                  <FloppyDisk />
                  仅保存
                </button>
                <button
                  className="enable-source"
                  onClick={() => void save(item, true)}
                  disabled={busy === item.provider || !encryptionReady}
                >
                  <CheckCircle />
                  校验并启用
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
