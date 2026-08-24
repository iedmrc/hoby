import { resolveChrome } from "./platform/chrome-api";
import { isRuntimeRequest } from "./platform/messages";
import { ChromePermissionAdapter } from "./platform/permissions";
import { BackgroundRuntime } from "./platform/runtime";
import { WorkspaceRepository } from "./platform/storage";
import { ChromeTabAdapter } from "./platform/tabs";

const chromeApi = resolveChrome();

if (chromeApi) {
  const repository = new WorkspaceRepository(chromeApi.storage.local);
  const runtime = new BackgroundRuntime(
    repository,
    new ChromeTabAdapter(chromeApi.tabs),
    new ChromePermissionAdapter(chromeApi.permissions),
  );

  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRuntimeRequest(message)) return false;
    void runtime.handle(message).then(sendResponse);
    return true;
  });

  // Listeners are registered before asynchronous initialization so an early
  // event can wake and use the worker. initialize() is idempotent.
  void runtime.initialize().catch((error: unknown) => {
    console.error("Hoby background initialization failed.", error);
  });

  chromeApi.runtime.onInstalled?.addListener(() => {
    void runtime.initialize().catch((error: unknown) => {
      console.error("Hoby installation initialization failed.", error);
    });
  });
}
