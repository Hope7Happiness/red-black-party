"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { RoomView } from "@/lib/game-types";
import {
  ApiError,
  createRoom,
  fetchRoom,
  isSessionGone,
  joinRoom,
  normalizeCode,
  sendAction,
  storage,
  syncUrl,
  type JoinResult,
} from "./api";
import { HomeScreen } from "./home-screen";
import { RoomScreen, type ActionInput } from "./room-screen";
import { Btn } from "./ui";

type Session = { code: string; token: string };

const POLL_MS = 1500;
const MAX_BACKOFF_MS = 8000;

function goneMessage(err: unknown): string {
  if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
    return "这个房间已经不存在或已过期，可以重新创建一个。";
  }
  return "你已不在这个房间里（可能被移出或身份已失效），可以重新加入。";
}

/** Offer a fresh join to the same room only if the room itself still exists. */
function rejoinCode(err: unknown, code: string): string | null {
  return err instanceof ApiError && (err.status === 404 || err.status === 410) ? null : code;
}

function isAbort(err: unknown) {
  return (err as { name?: string } | null)?.name === "AbortError";
}

export function RedBlackApp() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);

  // Home screen state
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [resumeCode, setResumeCode] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [homeBusy, setHomeBusy] = useState<"create" | "join" | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeKey, setHomeKey] = useState(0);

  // Room state
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [netIssue, setNetIssue] = useState(false);
  const pollNowRef = useRef<() => void>(() => {});

  /** Accept a room snapshot only if it belongs to this session and is not older than what we have. */
  const applyRoom = useCallback((next: RoomView, code: string) => {
    if (next.code !== code) return;
    const cur = roomRef.current;
    if (cur && cur.code === next.code && next.version < cur.version) return;
    roomRef.current = next;
    setRoom(next);
  }, []);

  const goHome = useCallback(
    (opts: { notice?: string | null; prefillCode?: string | null; clearCode?: string | null }) => {
      if (opts.clearCode) storage.clearToken(opts.clearCode);
      roomRef.current = null;
      setRoom(null);
      setSession(null);
      setBusy(null);
      busyRef.current = false;
      setNetIssue(false);
      setActionError(null);
      setNotice(opts.notice ?? null);
      setInviteCode(opts.prefillCode ?? null);
      setResumeCode(storage.getLastRoom());
      setSavedName(storage.getName());
      setHomeError(null);
      setHomeKey((k) => k + 1);
      syncUrl(opts.prefillCode ?? null);
    },
    [],
  );

  // Boot: read ?room and stored session.
  useEffect(() => {
    let code: string | null = null;
    try {
      const raw = new URLSearchParams(window.location.search).get("room");
      code = raw ? normalizeCode(raw) : null;
    } catch {
      code = null;
    }
    if (code && code.length !== 6) code = null;
    setSavedName(storage.getName());
    const token = code ? storage.getToken(code) : null;
    if (code && token) {
      setSession({ code, token });
    } else {
      setInviteCode(code);
      setResumeCode(storage.getLastRoom());
      syncUrl(code);
    }
    setBooted(true);
  }, []);

  // Polling loop: sequential (no overlap), paused while hidden, backs off on failure.
  useEffect(() => {
    if (!session) return;
    const { code, token } = session;
    let stopped = false;
    let timer: number | undefined;
    let ctrl: AbortController | null = null;
    let failures = 0;

    const schedule = (ms: number) => {
      if (stopped || timer !== undefined) return;
      timer = window.setTimeout(tick, ms);
    };

    async function tick() {
      timer = undefined;
      if (stopped || ctrl) return;
      if (document.visibilityState === "hidden") return; // resumed on visibilitychange
      ctrl = new AbortController();
      try {
        const res = await fetchRoom(code, token, ctrl.signal);
        if (stopped) return;
        failures = 0;
        setNetIssue(false);
        if (res?.room) applyRoom(res.room, code);
      } catch (err) {
        if (stopped || isAbort(err)) return;
        if (isSessionGone(err)) {
          stopped = true;
          goHome({ notice: goneMessage(err), prefillCode: rejoinCode(err, code), clearCode: code });
          return;
        }
        failures += 1;
        setNetIssue(true);
      } finally {
        ctrl = null;
      }
      schedule(failures ? Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS) : POLL_MS);
    }

    const pollNow = () => {
      if (stopped || ctrl) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      void tick();
    };
    pollNowRef.current = pollNow;

    const onVisible = () => {
      if (document.visibilityState === "visible") pollNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", pollNow);
    void tick();

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", pollNow);
      pollNowRef.current = () => {};
    };
  }, [session, applyRoom, goHome]);

  // Keep URL in sync with the active room.
  useEffect(() => {
    if (session) syncUrl(session.code);
  }, [session]);

  // Auto-dismiss action errors.
  useEffect(() => {
    if (!actionError) return;
    const t = window.setTimeout(() => setActionError(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionError]);

  const enterRoom = (res: JoinResult, name: string) => {
    const code = res.room.code;
    storage.setToken(code, res.token);
    storage.setName(name);
    roomRef.current = null;
    applyRoom(res.room, code);
    setNotice(null);
    setInviteCode(null);
    setSession({ code, token: res.token });
  };

  const handleCreate = async (name: string) => {
    if (homeBusy) return;
    setHomeBusy("create");
    setHomeError(null);
    try {
      enterRoom(await createRoom(name), name);
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : "创建失败，请重试");
    } finally {
      setHomeBusy(null);
    }
  };

  const handleJoin = async (code: string, name: string) => {
    if (homeBusy) return;
    setHomeBusy("join");
    setHomeError(null);
    try {
      enterRoom(await joinRoom(code, name), name);
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : "加入失败，请重试");
    } finally {
      setHomeBusy(null);
    }
  };

  const handleResume = () => {
    const code = resumeCode;
    const token = code ? storage.getToken(code) : null;
    if (!code || !token) {
      setResumeCode(null);
      return;
    }
    setNotice(null);
    setSession({ code, token });
  };

  const handleAction = useCallback(
    async (action: ActionInput): Promise<boolean> => {
      const cur = roomRef.current;
      if (!session || !cur || busyRef.current) return false;
      busyRef.current = true;
      setBusy(action.type);
      setActionError(null);
      try {
        const res = await sendAction(session.code, session.token, { ...action, round: cur.round } as Parameters<typeof sendAction>[2]);
        if (res.left) {
          goHome({ clearCode: session.code, notice: "你已离开房间。" });
          return true;
        }
        if (res.room) applyRoom(res.room, session.code);
        return true;
      } catch (err) {
        if (err instanceof ApiError && [401, 404, 410].includes(err.status)) {
          goHome({ notice: goneMessage(err), prefillCode: rejoinCode(err, session.code), clearCode: session.code });
          return false;
        }
        setActionError(err instanceof Error ? err.message : "操作失败，请重试");
        pollNowRef.current();
        return false;
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [session, applyRoom, goHome],
  );

  if (!booted) {
    return <div className="min-h-dvh" aria-hidden />;
  }

  if (session && !room) {
    return (
      <main className="rb-shell flex min-h-dvh flex-col items-center justify-center gap-5 text-center">
        <Loader2 className="size-8 animate-spin text-[var(--rb-muted)]" aria-hidden />
        <p className="text-lg font-semibold" role="status">
          {netIssue ? "网络不稳定，正在重试…" : `正在回到房间 ${session.code}…`}
        </p>
        <div className="flex gap-3">
          {netIssue && (
            <Btn variant="outline" onClick={() => pollNowRef.current()}>
              立即重试
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => goHome({})}>
            返回首页
          </Btn>
        </div>
      </main>
    );
  }

  if (session && room) {
    return (
      <>
        <RoomScreen room={room} busy={busy} netIssue={netIssue} onAction={handleAction} onRetry={() => pollNowRef.current()} />
        {actionError && (
          <div className="rb-toast" role="alert">
            <span className="flex-1">{actionError}</span>
            <button type="button" className="rb-toast-x" onClick={() => setActionError(null)} aria-label="关闭提示">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <HomeScreen
      key={homeKey}
      initialName={savedName}
      inviteCode={inviteCode}
      resumeCode={resumeCode}
      notice={notice}
      busy={homeBusy}
      error={homeError}
      onCreate={handleCreate}
      onJoin={handleJoin}
      onResume={handleResume}
      onDismissResume={() => setResumeCode(null)}
      onClearInvite={() => {
        setInviteCode(null);
        setHomeError(null);
        syncUrl(null);
      }}
    />
  );
}
