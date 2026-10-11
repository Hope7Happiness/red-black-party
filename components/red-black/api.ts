import type { Action, RoomView } from "@/lib/game-types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Status codes that mean "this session is gone" (expired room, kicked, bad token). */
export function isSessionGone(err: unknown): boolean {
  return err instanceof ApiError && [401, 403, 404, 410].includes(err.status);
}

const FRIENDLY: Record<number, string> = {
  400: "请求无效，请重试",
  401: "身份已失效，请重新加入",
  403: "没有权限执行此操作",
  404: "房间不存在或已过期",
  409: "房间状态已变化，请稍候",
  410: "房间已过期",
  429: "操作太频繁，请稍后再试",
};

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      cache: "no-store",
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError") throw err;
    throw new ApiError("网络连接失败，请检查网络", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body; handled below.
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : FRIENDLY[res.status] ?? `服务器出错（${res.status}）`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export type JoinResult = { token: string; room: RoomView };

export function createRoom(name: string) {
  return request<JoinResult>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function joinRoom(code: string, name: string) {
  return request<JoinResult>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchRoom(code: string, token: string, signal?: AbortSignal) {
  return request<{ room: RoomView }>(`/api/rooms/${encodeURIComponent(code)}`, {
    token,
    signal,
  });
}

export function sendAction(code: string, token: string, action: Action) {
  return request<{ room?: RoomView; left?: boolean }>(
    `/api/rooms/${encodeURIComponent(code)}/action`,
    { method: "POST", token, body: JSON.stringify(action) },
  );
}

/* ---------- localStorage (never throws) ---------- */

const TOKEN_PREFIX = "rbp:token:";
const NAME_KEY = "rbp:name";
const LAST_KEY = "rbp:last";
const RESET_KEY = "rbp:data-reset";
const RESET_EPOCH = "2026-10-11-owner-purge";

// On the next visit, discard identities saved before the owner's data reset.
function resetOldStorage() {
  if (window.localStorage.getItem(RESET_KEY) === RESET_EPOCH) return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(store)) {
      if (key.startsWith("rbp:")) store.removeItem(key);
    }
  }
  window.localStorage.setItem(RESET_KEY, RESET_EPOCH);
}

function safeGet(key: string): string | null {
  try {
    resetOldStorage();
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    resetOldStorage();
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / quota; session simply won't survive refresh.
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const storage = {
  getToken: (code: string) => safeGet(TOKEN_PREFIX + code),
  setToken: (code: string, token: string) => {
    safeSet(TOKEN_PREFIX + code, token);
    safeSet(LAST_KEY, code);
  },
  clearToken: (code: string) => {
    safeRemove(TOKEN_PREFIX + code);
    if (safeGet(LAST_KEY) === code) safeRemove(LAST_KEY);
  },
  getLastRoom: () => {
    const code = safeGet(LAST_KEY);
    return code && safeGet(TOKEN_PREFIX + code) ? code : null;
  },
  getName: () => safeGet(NAME_KEY) ?? "",
  setName: (name: string) => safeSet(NAME_KEY, name),
};

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function roomUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  return url.toString();
}

export function syncUrl(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    if (url.toString() !== window.location.href) {
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    // ignore
  }
}
