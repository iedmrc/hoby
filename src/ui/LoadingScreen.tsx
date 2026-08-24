import { Logo } from "./Logo";

export function LoadingScreen() {
  return (
    <div aria-live="polite" className="loading-screen">
      <Logo size={42} />
      <span>Preparing your workspace…</span>
    </div>
  );
}

