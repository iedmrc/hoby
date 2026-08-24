import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspaceApp } from "../app/useWorkspaceApp";
import { LoadingScreen } from "../ui/LoadingScreen";
import { PopupApp } from "./PopupApp";

function Root() {
  const state = useWorkspaceApp();
  if (!state.workspace) return <LoadingScreen />;
  return <PopupApp {...state} workspace={state.workspace} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><Root /></StrictMode>,
);

