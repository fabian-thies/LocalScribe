import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="grid justify-items-center gap-3 px-5 py-9 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-surface-soft text-muted-strong">
        {icon}
      </div>
      <div className="grid gap-1">
        <strong className="text-[14px] text-text">{title}</strong>
        {description ? <p className="max-w-[42ch] text-[13px] leading-[1.45] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
