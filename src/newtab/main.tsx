import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspaceApp } from "../app/useWorkspaceApp";
import { LoadingScreen } from "../ui/LoadingScreen";
import { NewTabApp } from "./NewTabApp";

function Root() {
  const state = useWorkspaceApp();
  if (!state.workspace) return <LoadingScreen />;
  return <NewTabApp {...state} workspace={state.workspace} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><Root /></StrictMode>,
);

