import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
const SiteContext = createContext(null);
export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { credentials: "include", ...options, headers, body: options.body && !isForm && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) { const error = new Error(payload?.error || `请求失败（${response.status}）`); error.code = payload?.code; error.status = response.status; error.retryAfter = Number(payload?.retryAfter) || 0; throw error; }
  return payload;
}
export function asItems(payload) { return Array.isArray(payload) ? payload : payload?.items || []; }
export function Provider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ registrationEnabled: false, maxUploadBytes: 50 * 1024 * 1024 });
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const refresh = useCallback(async () => { try { const result = await api("/bootstrap"); setUser(result.user || null); setConfig(result.config || {}); setBootstrapError(""); } catch (error) { setBootstrapError(error.message); } finally { setReady(true); } }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo(() => ({ user, config, ready, bootstrapError, refresh, setUser }), [user, config, ready, bootstrapError, refresh]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
export function useSite() { const value = useContext(SiteContext); if (!value) throw new Error("useSite must be used inside Provider"); return value; }
