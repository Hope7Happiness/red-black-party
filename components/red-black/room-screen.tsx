"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Link2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Action, Color, PlayerView, RoomView } from "@/lib/game-types";
import { roomUrl } from "./api";
import { Avatar, Btn, CardBack, CardFace, COLOR_LABEL, COLOR_MEANING, ConfirmDialog } from "./ui";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 24;

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action without `round`; the app fills in the current round. */
export type ActionInput = DistOmit<Action, "round">;

export type RoomProps = {
  room: RoomView;
  busy: string | null;
  netIssue: boolean;
  onAction: (action: ActionInput) => Promise<boolean>;
  onRetry: () => void;
};

const PHASE_LABEL: Record<RoomView["phase"], string> = {
  lobby: "等待开始",
  submit: "出牌",
  guess: "猜红牌数",
  results: "开牌",
};

export function RoomScreen(props: RoomProps) {
  const { room, busy, netIssue, onAction, onRetry } = props;
  const me = room.players.find((p) => p.id === room.me.id);
  const isHost = !!me?.isHost;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="rb-shell flex min-h-dvh flex-col">
      <header className="rb-topbar">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--rb-muted)]">
            房间 <span className="rb-code text-[var(--rb-ink)]">{room.code}</span>
          </p>
          <p className="text-lg font-bold leading-tight">
            {room.phase === "lobby" ? PHASE_LABEL.lobby : `第 ${room.round} 轮 · ${PHASE_LABEL[room.phase]}`}
          </p>
        </div>
        {isHost && room.phase !== "lobby" && (
          <Btn variant="ghost" className="rb-btn-sm" onClick={() => setConfirmReset(true)} disabled={!!busy}>
            回到大厅
          </Btn>
        )}
      </header>

      {netIssue && (
        <div className="rb-net" role="status">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">连接不稳定，正在重试…</span>
          <button type="button" className="rb-link" onClick={onRetry}>
            立即重试
          </button>
        </div>
      )}

      <PhaseProgress phase={room.phase} />

      <div className="flex flex-1 flex-col gap-5 pb-6 pt-4">
        {room.phase === "lobby" && <Lobby key="lobby" {...props} isHost={isHost} />}
        {room.phase === "submit" && <SubmitPhase key={`s${room.round}`} {...props} />}
        {room.phase === "guess" && <GuessPhase key={`g${room.round}`} {...props} />}
        {room.phase === "results" && <ResultsPhase key={`r${room.round}`} {...props} isHost={isHost} />}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="结束本轮，回到大厅？"
        confirmLabel="回到大厅"
        confirmVariant="danger"
        loading={busy === "reset"}
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await onAction({ type: "reset" });
          setConfirmReset(false);
        }}
      >
        本轮所有出牌、猜测和翻牌都会作废，无法恢复。大家会回到等待界面。
      </ConfirmDialog>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function PhaseProgress({ phase }: { phase: RoomView["phase"] }) {
  if (phase === "lobby") return null;
  const steps: RoomView["phase"][] = ["submit", "guess", "results"];
  const idx = steps.indexOf(phase);
  return (
    <ol className="rb-steps" aria-label="本轮进度">
      {steps.map((s, i) => (
        <li key={s} className={cn(i < idx && "done", i === idx && "now")} aria-current={i === idx ? "step" : undefined}>
          {PHASE_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rb-panel", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {aside && <span className="text-sm text-[var(--rb-muted)]">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  return <div className="rb-bottom">{children}</div>;
}

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ink" | "red" | "ok" }) {
  return <span className={cn("rb-tag", `rb-tag-${tone}`)}>{children}</span>;
}

function nameOf(room: RoomView, id: string) {
  return room.players.find((p) => p.id === id)?.name ?? "已离开的玩家";
}

function MyCard({ color }: { color: Color }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <div className="rb-flip" data-show={show}>
        {show ? <CardFace color={color} size="sm" /> : <CardBack size="sm" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{show ? `你出的是${COLOR_LABEL[color]}` : "你的牌已扣下"}</p>
        <p className="text-sm text-[var(--rb-muted)]">只有你自己能看到</p>
      </div>
      <Btn variant="outline" className="rb-btn-sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {show ? "盖上" : "看一眼"}
      </Btn>
    </div>
  );
}

function WaitingList({ players, doneKey, meId }: { players: PlayerView[]; doneKey: "submitted" | "guessed"; meId: string }) {
  const waiting = players.filter((p) => !p[doneKey]);
  return (
    <ul className="flex flex-wrap gap-2" aria-label="玩家状态">
      {players.map((p) => (
        <li key={p.id} className={cn("rb-chip", p[doneKey] ? "rb-chip-done" : "rb-chip-wait")}>
          {p[doneKey] ? <Check className="size-3.5" aria-hidden /> : <span className="rb-dot" aria-hidden />}
          <span className="truncate">{p.name}</span>
          {p.id === meId && <span className="text-[var(--rb-muted)]">（你）</span>}
          <span className="sr-only">{p[doneKey] ? "已完成" : "等待中"}</span>
        </li>
      ))}
      {waiting.length === 0 && <li className="sr-only">全部完成</li>}
    </ul>
  );
}

/* ---------------- lobby ---------------- */

function ShareBox({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const url = typeof window === "undefined" ? "" : roomUrl(code);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(url);
      setState("copied");
      window.setTimeout(() => setState((s) => (s === "copied" ? "idle" : s)), 2000);
    } catch {
      setState("manual");
    }
  };

  return (
    <Section title="邀请朋友">
      <p className="text-sm text-[var(--rb-muted)]">让朋友打开链接，或在首页输入房间码</p>
      <p className="rb-code mt-3 text-center text-4xl tracking-[0.25em]" aria-label={`房间码 ${code.split("").join(" ")}`}>
        {code}
      </p>
      <Btn variant="outline" className="mt-4 w-full" onClick={copy}>
        {state === "copied" ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
        {state === "copied" ? "已复制邀请链接" : "复制邀请链接"}
      </Btn>
      {state === "manual" && (
        <div className="mt-3">
          <label htmlFor="rb-share-url" className="flex items-center gap-1.5 text-sm text-[var(--rb-muted)]">
            <Link2 className="size-4" aria-hidden />
            无法自动复制，请长按下面的链接手动复制
          </label>
          <input
            id="rb-share-url"
            readOnly
            className="rb-input mt-2 text-sm"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
          />
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "链接已复制" : ""}
      </span>
    </Section>
  );
}

function Lobby({ room, busy, onAction, isHost }: RoomProps & { isHost: boolean }) {
  const [kick, setKick] = useState<PlayerView | null>(null);
  const [leave, setLeave] = useState(false);
  const n = room.players.length;
  const enough = n >= MIN_PLAYERS;
  const host = room.players.find((p) => p.isHost);

  return (
    <>
      <ShareBox code={room.code} />

      <Section title="玩家" aside={`${n} / ${MAX_PLAYERS} 人`}>
        <ul className="flex flex-col">
          {room.players.map((p) => (
            <li key={p.id} className="rb-row">
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              {p.isHost && <Tag tone="ink">房主</Tag>}
              {p.id === room.me.id && <Tag>你</Tag>}
              {isHost && p.id !== room.me.id && (
                <Btn variant="ghost" className="rb-btn-sm" onClick={() => setKick(p)} disabled={!!busy} aria-label={`移出 ${p.name}`}>
                  移出
                </Btn>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="怎么玩">
        <ol className="rb-rules">
          <li>每轮由大家当面提一个问题（“你有没有……”）。</li>
          <li>
            做过出<b className="text-[var(--rb-red)]">红牌</b>，没做过出<b>黑牌</b>，悄悄出，谁也看不到。
          </li>
          <li>猜全场一共几张红牌，所有人提交前可以修改。</li>
          <li>猜中的人可以偷看任意一位玩家的牌，只有自己知道。</li>
        </ol>
      </Section>

      <button type="button" className="rb-link self-center" onClick={() => setLeave(true)} disabled={!!busy}>
        离开房间
      </button>

      <BottomBar>
        {isHost ? (
          <>
            {!enough && <p className="mb-2 text-center text-sm text-[var(--rb-muted)]">至少 {MIN_PLAYERS} 人才能开始，先邀请朋友吧</p>}
            <Btn className="w-full" disabled={!enough || n > MAX_PLAYERS || !!busy} loading={busy === "start"} onClick={() => onAction({ type: "start" })}>
              发牌，开始游戏
            </Btn>
          </>
        ) : (
          <p className="rb-waiting">等待{host ? ` ${host.name} ` : "房主"}开始游戏…</p>
        )}
      </BottomBar>

      <ConfirmDialog
        open={!!kick}
        title={kick ? `把「${kick.name}」移出房间？` : ""}
        confirmLabel="移出"
        confirmVariant="danger"
        loading={busy === "kick"}
        onClose={() => setKick(null)}
        onConfirm={async () => {
          if (!kick) return;
          await onAction({ type: "kick", targetId: kick.id });
          setKick(null);
        }}
      >
        TA 的手机会回到首页。
      </ConfirmDialog>

      <ConfirmDialog
        open={leave}
        title="离开这个房间？"
        confirmLabel="离开"
        confirmVariant="danger"
        loading={busy === "leave"}
        onClose={() => setLeave(false)}
        onConfirm={async () => {
          const ok = await onAction({ type: "leave" });
          if (!ok) setLeave(false);
        }}
      >
        {isHost && n > 1 ? "你是房主，离开后房主会交给其他人。" : "之后可以用房间码重新加入。"}
      </ConfirmDialog>
    </>
  );
}

/* ---------------- submit ---------------- */

function Pile({ count, total, label }: { count: number; total: number; label: string }) {
  const shown = Math.min(count, 8);
  return (
    <div className="flex items-center gap-5">
      <div className="rb-pile" aria-hidden>
        {count === 0 && <span className="rb-pile-empty" />}
        {Array.from({ length: shown }, (_, i) => (
          <CardBack key={i} size="sm" className="rb-pile-card" style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
      <div>
        <p className="text-3xl font-black tabular-nums">
          {count}
          <span className="text-lg font-bold text-[var(--rb-muted)]"> / {total}</span>
        </p>
        <p className="text-sm text-[var(--rb-muted)]">{label}</p>
      </div>
    </div>
  );
}

function SubmitPhase({ room, busy, onAction }: RoomProps) {
  const [pick, setPick] = useState<Color | null>(null);
  const [editing, setEditing] = useState(false);
  const n = room.players.length;
  const mine = room.me.card;
  const picking = mine === null || editing;

  const save = async () => {
    if (pick === null) return;
    const ok = await onAction({ type: "card", color: pick });
    if (ok) setEditing(false);
  };

  return (
    <>
      {!picking && mine ? (
        <Section>
          <MyCard color={mine} />
        </Section>
      ) : (
        <Section title={editing ? "修改出牌" : "出一张牌"} aside="谁也看不到">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="选择你的牌">
            {(["red", "black"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={pick === c}
                className={cn("rb-choice", pick === c && "selected", pick && pick !== c && "dim")}
                onClick={() => setPick(c)}
                disabled={!!busy}
              >
                <CardFace color={c} size="md" />
                <span className="mt-3 text-lg font-bold">{COLOR_LABEL[c]}</span>
                <span className="text-sm text-[var(--rb-muted)]">{COLOR_MEANING[c]}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="牌堆">
        <Pile count={room.submittedCount} total={n} label="已出牌" />
        <div className="mt-4">
          <WaitingList players={room.players} doneKey="submitted" meId={room.me.id} />
        </div>
      </Section>

      <BottomBar>
        {picking ? (
          <>
            <p className="mb-2 text-center text-sm text-[var(--rb-muted)]">全员交牌前可以修改，全部交牌后锁定</p>
            <div className="flex gap-2">
              {editing && <Btn variant="outline" disabled={!!busy} onClick={() => setEditing(false)}>取消</Btn>}
              <Btn
                variant={pick === "red" ? "red" : "primary"}
                className="flex-1"
                disabled={!pick || !!busy}
                loading={busy === "card"}
                onClick={save}
              >
                {pick ? `${editing ? "修改为" : "确认出"}${COLOR_LABEL[pick]}` : "确认出牌"}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <p className="rb-waiting mb-2">
              {room.submittedCount >= n ? "全部出完，马上开始猜…" : `等其他人出牌（还差 ${n - room.submittedCount} 人）`}
            </p>
            <Btn variant="outline" className="w-full" disabled={!!busy} onClick={() => { setPick(mine); setEditing(true); }}>修改出牌</Btn>
          </>
        )}
      </BottomBar>
    </>
  );
}

/* ---------------- guess ---------------- */

function GuessPhase({ room, busy, onAction }: RoomProps) {
  const [pick, setPick] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const n = room.players.length;
  const myGuess = room.me.guess;
  const picking = myGuess === null || editing;

  const save = async () => {
    if (pick === null) return;
    const ok = await onAction({ type: "guess", value: pick });
    if (ok) setEditing(false);
  };

  return (
    <>
      {picking ? (
        <Section title={editing ? "修改猜测" : "一共有几张红牌？"} aside={`共 ${n} 张牌`}>
          <div className="rb-numgrid" role="radiogroup" aria-label="猜红牌总数">
            {Array.from({ length: n + 1 }, (_, v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={pick === v}
                className={cn("rb-num", pick === v && "selected")}
                onClick={() => setPick(v)}
                disabled={!!busy}
              >
                {v}
              </button>
            ))}
          </div>
        </Section>
      ) : (
        <Section>
          <p className="text-sm text-[var(--rb-muted)]">你的猜测</p>
          <p className="mt-1 text-4xl font-black">
            {myGuess} <span className="text-lg font-bold">张红牌</span>
          </p>
        </Section>
      )}

      {room.me.card && (
        <Section>
          <MyCard color={room.me.card} />
        </Section>
      )}

      <Section title="猜测进度" aside={`${room.guessedCount} / ${n}`}>
        <WaitingList players={room.players} doneKey="guessed" meId={room.me.id} />
      </Section>

      <BottomBar>
        {picking ? (
          <>
            <p className="mb-2 text-center text-sm text-[var(--rb-muted)]">全员提交前可以修改，全部提交后锁定</p>
            <div className="flex gap-2">
              {editing && <Btn variant="outline" disabled={!!busy} onClick={() => setEditing(false)}>取消</Btn>}
              <Btn className="flex-1" disabled={pick === null || !!busy} loading={busy === "guess"} onClick={save}>
                {pick === null ? "选一个数字" : `${editing ? "修改为" : "确认：猜"} ${pick} 张红牌`}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <p className="rb-waiting mb-2">
              {room.guessedCount >= n ? "全部猜完，马上开牌…" : `等其他人猜（还差 ${n - room.guessedCount} 人）`}
            </p>
            <Btn variant="outline" className="w-full" disabled={!!busy} onClick={() => { setPick(myGuess); setEditing(true); }}>修改猜测</Btn>
          </>
        )}
      </BottomBar>
    </>
  );
}

/* ---------------- results ---------------- */

function ResultsPhase({ room, busy, onAction, isHost }: RoomProps & { isHost: boolean }) {
  const [target, setTarget] = useState<string | null>(null);
  const n = room.players.length;
  const red = room.redCount ?? 0;
  const winners = room.players.filter((p) => p.correct);
  const pendingWinners = winners.filter((p) => !p.usedReveal);
  const others = room.players.filter((p) => p.id !== room.me.id);
  const targetPlayer = room.players.find((p) => p.id === target) ?? null;
  const reveals = [...room.reveals].reverse();

  return (
    <>
      <Section className="text-center">
        <p className="text-sm text-[var(--rb-muted)]">这一轮的红牌</p>
        <p className="mt-1 text-6xl font-black text-[var(--rb-red)] tabular-nums">{room.redCount ?? "?"}</p>
        <p className="text-sm text-[var(--rb-muted)]">
          共 {n} 张牌 · 黑牌 {Math.max(0, n - red)} 张
        </p>
        <div className="rb-spread mt-4" aria-hidden>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={cn("rb-mini", i < red ? "rb-mini-red" : "rb-mini-black")} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <p className="mt-4 font-semibold">
          {winners.length === 0 ? "这一轮没人猜中" : `猜中：${winners.map((w) => w.name).join("、")}`}
        </p>
      </Section>

      {room.me.canReveal && (
        <Section title="你猜中了！选一个人翻牌" className="rb-panel-accent">
          {others.length === 0 ? (
            <p className="text-[var(--rb-muted)]">没有其他可查看的玩家。</p>
          ) : (
            <>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="选择要翻牌的玩家">
                {others.map((p) => {
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={target === p.id}
                      disabled={!!busy}
                      className={cn("rb-pick", target === p.id && "selected")}
                      onClick={() => setTarget(p.id)}
                    >
                      <Avatar name={p.name} />
                      <span className="min-w-0 flex-1 truncate text-left font-semibold">{p.name}</span>
                      {target === p.id ? <Check className="size-5" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
              <Btn
                className="mt-4 w-full"
                disabled={!targetPlayer || !!busy}
                loading={busy === "reveal"}
                onClick={async () => {
                  if (!targetPlayer) return;
                  const ok = await onAction({ type: "reveal", targetId: targetPlayer.id });
                  if (!ok) setTarget(null);
                }}
              >
                {targetPlayer ? `查看「${targetPlayer.name}」的牌` : "选一个人"}
              </Btn>
              <p className="mt-2 text-center text-sm text-[var(--rb-muted)]">只有一次机会，仅你和对方知道这次翻牌</p>
            </>
          )}
        </Section>
      )}

      <Section title="与你有关的翻牌" aside={pendingWinners.length > 0 ? `等待 ${pendingWinners.map((p) => p.name).join("、")}` : undefined}>
        {reveals.length === 0 ? (
          <p className="text-[var(--rb-muted)]">{winners.length === 0 ? "没人猜中，本轮不翻牌。" : "暂时没有与你有关的翻牌记录。"}</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {reveals.map((r) => (
              <li key={`${r.byId}-${r.targetId}`} className="rb-reveal">
                <CardFace color={r.color} size="sm" className="rb-flip-in" />
                <p className="min-w-0 flex-1">
                  {r.byId === room.me.id ? <>你查看了 <b>{nameOf(room, r.targetId)}</b> 的牌</> : <><b>{nameOf(room, r.byId)}</b> 查看了你的牌</>}
                  <br />
                  <span className={cn("font-bold", r.color === "red" ? "text-[var(--rb-red)]" : "")}>
                    {COLOR_LABEL[r.color]} · {COLOR_MEANING[r.color]}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="大家的猜测">
        <ul className="flex flex-col">
          {room.players.map((p) => (
            <li key={p.id} className="rb-row">
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {p.name}
                {p.id === room.me.id && <span className="font-normal text-[var(--rb-muted)]">（你）</span>}
              </span>
              {p.revealedCard && <CardFace color={p.revealedCard} size="xs" />}
              <span className="w-12 text-right tabular-nums">{p.guess ?? "—"}</span>
              {p.correct ? <Tag tone="ok">猜中</Tag> : <span className="w-[42px]" aria-hidden />}
            </li>
          ))}
        </ul>
      </Section>

      {room.me.card && (
        <Section>
          <MyCard color={room.me.card} />
        </Section>
      )}

      <BottomBar>
        {isHost ? (
          <>
            {!room.allRevealsDone && <p className="mb-2 text-center text-sm text-[var(--rb-muted)]">等猜中的人翻完牌，才能开始下一轮</p>}
            <Btn className="w-full" disabled={!room.allRevealsDone || !!busy} loading={busy === "next"} onClick={() => onAction({ type: "next" })}>
              洗牌，开始下一轮
            </Btn>
          </>
        ) : (
          <p className="rb-waiting">{room.allRevealsDone ? "等待房主开始下一轮…" : "等待猜中的人翻牌…"}</p>
        )}
      </BottomBar>
    </>
  );
}
