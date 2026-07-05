import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<string, string> = {
  primary: "border-accent bg-accent text-white hover:border-accent-strong hover:bg-accent-strong",
  secondary: "border-border bg-white text-text hover:border-border-strong hover:bg-[#f6faf8]",
  danger: "border-danger bg-danger text-white hover:border-[#84241d] hover:bg-[#84241d]",
  ghost: "border-transparent bg-transparent text-muted-strong hover:bg-surface-soft hover:text-text",
};

const sizes: Record<string, string> = {
  sm: "min-h-[34px] px-2.5 py-1.5 text-[13px]",
  md: "min-h-[38px] px-3 py-2 text-sm",
  lg: "min-h-[42px] px-3.5 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  children,
  className = "",
  disabled,
  fullWidth,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex max-w-full min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap border rounded-[10px] cursor-pointer font-semibold leading-tight transition-all duration-150 focus-visible:[box-shadow:0_0_0_3px_rgba(11,107,95,0.22)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 ${sizes[size] ?? sizes.md} ${fullWidth ? "w-full" : ""} ${variants[variant] ?? ""} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading || icon ? <span className="shrink-0">{loading ? <Loader2 size={16} className="animate-spin" /> : icon}</span> : null}
      {children ? <span className="min-w-0 truncate">{children}</span> : null}
    </button>
  );
}
