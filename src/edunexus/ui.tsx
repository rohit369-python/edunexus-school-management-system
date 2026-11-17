import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

const kinds = {
  solid: "bg-teal text-card hover:bg-teal-deep",
  clay: "bg-clay text-card",
  line: "border border-line bg-card text-ink hover:bg-paper-2",
  ghost: "bg-transparent text-ink-soft hover:bg-paper-2 hover:text-ink",
} as const;

export function Btn({
  kind = "solid",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof kinds }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${className}`}
      {...props}
    />
  );
}

export const control =
  "min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function Pill({ tone, children }: { tone: "teal" | "clay" | "ink"; children: ReactNode }) {
  const toneClass = {
    teal: "bg-foam text-teal-deep",
    clay: "bg-clay-soft text-clay",
    ink: "bg-paper-2 text-ink-soft",
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-2xl border border-line bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-2xl text-ink">{title}</h2>
          <button type="button" className="min-h-11 min-w-11 rounded-full text-ink-soft hover:bg-paper-2" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
    </article>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function pretty(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function toneFor(value: string): "teal" | "clay" | "ink" {
  if (["present", "paid", "low", "published", "evaluated", "submitted", "active", "done"].includes(value)) return "teal";
  if (["absent", "overdue", "high", "failed", "late submitted"].includes(value)) return "clay";
  return "ink";
}
