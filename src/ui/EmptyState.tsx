import type { ReactNode } from "react";

interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}

export function EmptyState({ action, description, eyebrow, title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

