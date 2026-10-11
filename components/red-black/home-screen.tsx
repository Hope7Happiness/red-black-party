"use client";

import { useState, type FormEvent } from "react";
import { normalizeCode } from "./api";
import { Btn, CardFace } from "./ui";

const NAME_MAX = 16;

export function HomeScreen({
  initialName,
  inviteCode,
  resumeCode,
  notice,
  busy,
  error,
  onCreate,
  onJoin,
  onResume,
  onDismissResume,
  onClearInvite,
}: {
  initialName: string;
  inviteCode: string | null;
  resumeCode: string | null;
  notice: string | null;
  busy: "create" | "join" | null;
  error: string | null;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onResume: () => void;
  onDismissResume: () => void;
  onClearInvite: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(inviteCode ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmed = name.trim();
  const codeOk = code.length === 6;

  const requireName = () => {
    if (!trimmed) {
      setLocalError("先填一个昵称吧");
      document.getElementById("rb-name")?.focus();
      return false;
    }
    setLocalError(null);
    return true;
  };

  const submitJoin = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const target = inviteCode ?? code;
    if (!requireName()) return;
    if (target.length !== 6) {
      setLocalError("房间码是 6 位字母或数字");
      return;
    }
    onJoin(target, trimmed);
  };

  const submitCreate = () => {
    if (busy || !requireName()) return;
    onCreate(trimmed);
  };

  const shownError = localError ?? error;

  return (
    <main className="rb-shell flex flex-col justify-center gap-7 py-10">
      <header className="flex flex-col items-center text-center">
        <div className="rb-hero-cards" aria-hidden>
          <CardFace color="black" size="lg" className="rb-hero-left" />
          <CardFace color="red" size="lg" className="rb-hero-right" />
        </div>
        <h1 className="mt-6 text-4xl font-black tracking-tight">红黑牌</h1>
        <p className="mt-2 text-base text-[var(--rb-muted)]">做过出红，没做过出黑，猜猜一共几张红</p>
      </header>

      {notice && (
        <p role="status" className="rb-notice">
          {notice}
        </p>
      )}

      {resumeCode && !inviteCode && (
        <section className="rb-panel flex items-center gap-3" aria-label="回到上次的房间">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--rb-muted)]">上次的房间</p>
            <p className="rb-code text-xl">{resumeCode}</p>
          </div>
          <Btn variant="ghost" className="px-3" onClick={onDismissResume}>
            不了
          </Btn>
          <Btn onClick={onResume}>回到房间</Btn>
        </section>
      )}

      <form className="rb-panel flex flex-col gap-5" onSubmit={inviteCode ? submitJoin : (e) => { e.preventDefault(); submitCreate(); }} noValidate>
        {inviteCode && (
          <div className="text-center">
            <p className="text-sm text-[var(--rb-muted)]">你被邀请加入房间</p>
            <p className="rb-code mt-1 text-3xl">{inviteCode}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="rb-name" className="text-sm font-semibold">
            你的昵称
          </label>
          <input
            id="rb-name"
            className="rb-input"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="朋友们怎么称呼你"
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
          />
        </div>

        {inviteCode ? (
          <>
            <Btn type="submit" loading={busy === "join"} disabled={!!busy} className="w-full">
              加入房间
            </Btn>
            <button type="button" className="rb-link self-center" onClick={onClearInvite} disabled={!!busy}>
              不加入，自己开一个房间
            </button>
          </>
        ) : (
          <Btn type="submit" loading={busy === "create"} disabled={!!busy} className="w-full">
            创建房间
          </Btn>
        )}

        {shownError && (
          <p role="alert" className="rb-error">
            {shownError}
          </p>
        )}
      </form>

      {!inviteCode && (
        <form className="rb-panel flex flex-col gap-3" onSubmit={submitJoin} noValidate>
          <label htmlFor="rb-code" className="text-sm font-semibold">
            有房间码？
          </label>
          <div className="flex gap-3">
            <input
              id="rb-code"
              className="rb-input rb-code min-w-0 flex-1 text-center text-xl"
              value={code}
              placeholder="6 位房间码"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={6}
              onChange={(e) => {
                setCode(normalizeCode(e.target.value));
                setLocalError(null);
              }}
            />
            <Btn type="submit" variant="outline" loading={busy === "join"} disabled={!!busy || !codeOk}>
              加入
            </Btn>
          </div>
        </form>
      )}
    </main>
  );
}
