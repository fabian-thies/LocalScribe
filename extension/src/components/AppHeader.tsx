import type { ReactNode } from "react";

interface AppHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

export function AppHeader({ title, description, actions, compact = false }: AppHeaderProps) {
  return (
    <header className={`flex items-start justify-between gap-4 ${compact ? "mb-3" : "mb-2"} max-[720px]:flex-col`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border bg-white shadow-[0_8px_22px_rgba(20,33,31,0.08)]">
          <img src={chrome.runtime.getURL("icons/brand-logo.png")} alt="LocalScribe" width={34} height={34} />
        </div>
        <div className="min-w-0">
          {typeof title === "string" ? <h1 className="truncate">{title}</h1> : title}
          {description ? <div className="text-muted text-[13px] leading-[1.4]">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
