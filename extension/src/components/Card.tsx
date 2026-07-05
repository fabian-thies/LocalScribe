import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}

export function Card({ children, className = "", raised = false }: CardProps) {
  return (
    <section
      className={`${raised ? "app-card p-4" : "app-card-quiet p-4"} ${className}`.trim()}
    >
      {children}
    </section>
  );
}
