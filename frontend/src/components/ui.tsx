import type { ReactNode } from "react";

export function Panel({
  title,
  sub,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-card border border-line rounded-lg p-5 mb-5 ${className}`}>
      {title && <h2 className="text-[17px] font-semibold tracking-tight m-0">{title}</h2>}
      {sub && <p className="text-ink-3 text-[13.5px] mt-0.5 mb-4">{sub}</p>}
      {!sub && title && <div className="mb-4" />}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "default",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
}) {
  const base =
    "font-semibold text-sm rounded-md px-4 py-2 border transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
  const styles = {
    default: "bg-card border-line-strong text-ink hover:border-ink-3",
    primary: "bg-signal border-signal text-white hover:brightness-110",
    danger: "bg-card border-cause text-cause",
  }[variant];
  return (
    <button className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-ink-3 mt-3 max-w-[60ch]">{children}</p>;
}
