import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface NoticeProps {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger" | "loading";
  className?: string;
}

const tones: Record<string, string> = {
  info: "border-border bg-white text-muted-strong",
  success: "border-[#9bd7ba] bg-success-soft text-success",
  warning: "border-[#efcc82] bg-warning-soft text-warning",
  danger: "border-[#f0aaa4] bg-danger-soft text-danger",
  loading: "border-[#b9d8d3] bg-accent-soft text-accent-strong",
};

const icons: Record<string, ReactNode> = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <Info size={16} />,
  danger: <AlertCircle size={16} />,
  loading: <Loader2 size={16} className="animate-spin" />,
};

export function Notice({ children, tone = "info", className = "" }: NoticeProps) {
  return (
    <div className={`flex items-start gap-2.5 rounded-[12px] border p-3 text-[13px] leading-[1.45] ${tones[tone] ?? tones.info} ${className}`.trim()}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icons[tone] ?? icons.info}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
