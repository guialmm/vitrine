import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent-strong shadow-[0_8px_24px_-10px_var(--color-accent-glow)]",
  ghost: "text-text-dim hover:text-text hover:bg-surface-hover",
  outline: "border border-border-strong text-text hover:border-accent hover:text-accent",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = "primary", loading, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`${className} inline-block animate-spin rounded-full border-2 border-current border-r-transparent`}
    />
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-text-dim">{label}</span>
      {children}
      {error && <span className="block text-sm text-danger">{error}</span>}
    </label>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "ok" | "info"; children: ReactNode }) {
  const tones = {
    danger: "border-danger/30 bg-danger/10 text-danger",
    ok: "border-ok/30 bg-ok/10 text-ok",
    info: "border-accent/30 bg-accent-soft text-accent-strong",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-[10px] border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{children}</p>;
}
