import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PopupApp } from "../../src/popup/PopupApp";
import {
  createCommandResult,
  createFakeActions,
  createFakeOpenTabs,
  createFakeWorkspace,
} from "./fakes";

afterEach(cleanup);

function renderApp(overrides: Partial<React.ComponentProps<typeof PopupApp>> = {}) {
  const workspace = overrides.workspace ?? createFakeWorkspace();
  const actions = overrides.actions ?? createFakeActions(workspace);
  const openTabs = overrides.openTabs ?? createFakeOpenTabs();
  const view = render(
    <PopupApp
      actions={actions}
      allowFavicons={false}
      busy={false}
      hasTabAccess
      openTabs={openTabs}
      workspace={workspace}
      {...overrides}
    />,
  );
  return { actions, openTabs, workspace, ...view };
}

describe("PopupApp", () => {
  it("shows the permission state and requests optional tab access", async () => {
    const user = userEvent.setup();
    const actions = createFakeActions();
    renderApp({ actions, hasTabAccess: false, openTabs: [] });

    expect(screen.getByRole("heading", { name: "Save tabs without leaving your work" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enable open tabs" }));

    await waitFor(() => expect(actions.requestTabAccess).toHaveBeenCalledOnce());
    expect(await screen.findByText("Open tabs enabled")).toBeInTheDocument();
  });

  it("saves the current tab to the chosen collection", async () => {
    const user = userEvent.setup();
    const { actions } = renderApp();

    await user.click(screen.getByRole("button", { name: /Research.*Personal/ }));

    await waitFor(() => expect(actions.captureTabs).toHaveBeenCalledWith(
      "collection-research",
      [501],
    ));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("creates a collection and saves the current tab into the created collection", async () => {
    const user = userEvent.setup();
    const workspace = createFakeWorkspace();
    const actions = createFakeActions(workspace);
    vi.mocked(actions.dispatch).mockResolvedValueOnce(createCommandResult(workspace, {
      kind: "created",
      id: "collection-new",
    }));
    renderApp({ actions, workspace });

    await user.click(screen.getByRole("button", { name: "New collection" }));
    await user.type(screen.getByRole("textbox", { name: "Collection name" }), "Quick saves");
    await user.click(screen.getByRole("button", { name: "Create & save" }));

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledWith({
      type: "collection.create",
      spaceId: "space-personal",
      name: "Quick saves",
      color: "stone",
    }));
    await waitFor(() => expect(actions.captureTabs).toHaveBeenCalledWith("collection-new", [501]));
  });

  it("saves the current window into a newly created session collection", async () => {
    const user = userEvent.setup();
    const workspace = createFakeWorkspace();
    const actions = createFakeActions(workspace);
    vi.mocked(actions.dispatch).mockResolvedValueOnce(createCommandResult(workspace, {
      kind: "created",
      id: "collection-window",
    }));
    renderApp({ actions, workspace });

    await user.click(screen.getByRole("button", { name: "Save window" }));

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledOnce());
    const command = vi.mocked(actions.dispatch).mock.calls[0]?.[0];
    expect(command).toMatchObject({
      type: "collection.create",
      spaceId: "space-personal",
      color: "mint",
    });
    if (command?.type !== "collection.create") throw new Error("Window save did not create a collection.");
    expect(command.name).toMatch(/^Session · /);
    await waitFor(() => expect(actions.captureTabs).toHaveBeenCalledWith("collection-window", [501, 502]));
  });

  it("filters collections by collection and space names without dispatching", async () => {
    const user = userEvent.setup();
    const { actions } = renderApp();
    const search = screen.getByRole("textbox", { name: "Find collection" });

    await user.type(search, "Roadmap");

    expect(screen.getByRole("button", { name: /Roadmap.*Work/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Research.*Personal/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Work");

    expect(screen.getByRole("button", { name: /Roadmap.*Work/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Research.*Personal/ })).not.toBeInTheDocument();
    expect(actions.dispatch).not.toHaveBeenCalled();
    expect(actions.captureTabs).not.toHaveBeenCalled();
  });
});
