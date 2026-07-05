interface StatusBadgeProps {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  dot?: boolean;
}

const tones: Record<string, string> = {
  neutral: "border-border bg-white text-muted-strong",
  success: "border-[#7fbfa3] bg-[#d7eee4] text-[#064b32]",
  warning: "border-[#e3bd63] bg-warning-soft text-[#674100]",
  danger: "border-[#e89a92] bg-danger-soft text-[#7f241c]",
};

const dotTones: Record<string, string> = {
  neutral: "bg-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function StatusBadge({ label, tone = "neutral", dot = false }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex w-fit min-h-[29px] max-w-full items-center gap-1.5 overflow-hidden border rounded-full text-xs font-semibold leading-[1.15] px-[10px] py-[6px] whitespace-nowrap ${tones[tone] ?? tones.neutral}`.trim()}
      title={label}
    >
      {dot ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTones[tone] ?? dotTones.neutral}`} aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
