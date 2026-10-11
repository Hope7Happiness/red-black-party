"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Color } from "@/lib/game-types";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "red" | "outline" | "ghost" | "danger";
  loading?: boolean;
};

export function Btn({ variant = "primary", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("rb-btn", `rb-btn-${variant}`, className)}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const COLOR_LABEL: Record<Color, string> = { red: "红牌", black: "黑牌" };
export const COLOR_MEANING: Record<Color, string> = { red: "做过", black: "没做过" };

/** A face-up card. */
export function CardFace({ color, size = "md", className }: { color: Color; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn("rb-card", `rb-card-${size}`, color === "red" ? "rb-face-red" : "rb-face-black", className)}
      role="img"
      aria-label={COLOR_LABEL[color]}
    >
      <span className="rb-suit" aria-hidden>
        {color === "red" ? "♥" : "♠"}
      </span>
    </span>
  );
}

/** A face-down card. */
export function CardBack({ size = "md", className, style }: { size?: "sm" | "md" | "lg"; className?: string; style?: CSSProperties }) {
  return <span className={cn("rb-card rb-back", `rb-card-${size}`, className)} style={style} aria-hidden />;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmVariant = "primary",
  cancelLabel = "再想想",
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: BtnProps["variant"];
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute("open", "");
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="rb-dialog"
      aria-labelledby="rb-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!loading) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      {open && (
        <div className="p-6">
          <h2 id="rb-dialog-title" className="text-xl font-bold">
            {title}
          </h2>
          {children && <div className="mt-3 text-[15px] leading-relaxed text-[var(--rb-muted)]">{children}</div>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Btn variant="outline" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Btn>
            <Btn variant={confirmVariant} onClick={onConfirm} loading={loading} autoFocus>
              {confirmLabel}
            </Btn>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const ch = Array.from(name.trim())[0] ?? "?";
  return (
    <span className={cn("rb-avatar", className)} aria-hidden>
      {ch.toUpperCase()}
    </span>
  );
}
