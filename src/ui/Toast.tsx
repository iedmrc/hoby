import { Button } from "./Button";

interface ToastProps {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export function Toast({ actionLabel, message, onAction, onDismiss }: ToastProps) {
  return (
    <div aria-live="polite" className="toast" role="status">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <Button onClick={onAction} tone="quiet">{actionLabel}</Button>
      ) : null}
      <Button aria-label="Dismiss" icon="close" iconOnly onClick={onDismiss} tone="quiet" />
    </div>
  );
}

