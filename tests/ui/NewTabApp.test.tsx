import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NewTabApp } from "../../src/newtab/NewTabApp";
import {
  createCommandResult,
  createDataTransfer,
  createFakeActions,
  createFakeOpenTabs,
  createFakeWorkspace,
  installDialogPolyfill,
} from "./fakes";

beforeAll(installDialogPolyfill);
afterEach(cleanup);

function renderApp(overrides: Partial<React.ComponentProps<typeof NewTabApp>> = {}) {
  const workspace = overrides.workspace ?? createFakeWorkspace();
  const actions = overrides.actions ?? createFakeActions(workspace);
  const openTabs = overrides.openTabs ?? createFakeOpenTabs();
  const view = render(
    <NewTabApp
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

function collectionCard(container: HTMLElement, collectionId: string): HTMLElement {
  const card = container.querySelector<HTMLElement>(`[data-collection-id="${collectionId}"]`);
  if (!card) throw new Error(`Collection card ${collectionId} was not rendered.`);
  return card;
}

describe("NewTabApp", () => {
  it("renders navigation, the collection workspace, and current-window tabs", () => {
    const { container } = renderApp();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("workspace-main");
    expect(screen.getByTestId("collection-grid")).toBeInTheDocument();
    expect(collectionCard(container, "collection-research")).toHaveTextContent("Research");
    expect(screen.getByRole("heading", { name: "Open tabs" })).toBeInTheDocument();
    expect(screen.getByTitle("Hoby issue")).toBeInTheDocument();
  });

  it("requests optional tab access from the permission prompt", async () => {
    const user = userEvent.setup();
    const actions = createFakeActions();
    renderApp({ actions, hasTabAccess: false, openTabs: [] });

    await user.click(screen.getByRole("button", { name: "Enable open tabs" }));

    await waitFor(() => expect(actions.requestTabAccess).toHaveBeenCalledOnce());
  });

  it("focuses search from the keyboard and finds saved tabs across spaces", async () => {
    const user = userEvent.setup();
    renderApp();
    const search = screen.getByRole("textbox", { name: /Search tabs and collections/ });

    (document.activeElement as HTMLElement).blur();
    await user.keyboard("/");
    expect(search).toHaveFocus();
    await user.type(search, "Launch checklist");

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Launch checklist/ })).toBeInTheDocument();
    expect(within(collectionCard(document.body, "collection-roadmap")).getByText("Work")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /React guide/ })).not.toBeInTheDocument();
  });

  it("creates a collection through the dialog and dispatches its selected color", async () => {
    const user = userEvent.setup();
    const { actions } = renderApp();

    await user.click(screen.getByRole("button", { name: "New collection" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Product ideas");
    await user.click(within(dialog).getByRole("radio", { name: "violet" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledWith({
      type: "collection.create",
      spaceId: "space-personal",
      name: "Product ideas",
      color: "violet",
    }));
  });

  it("saves an open tab when it is dragged into a collection", async () => {
    const { actions, container } = renderApp();
    const row = screen.getByTitle("Hoby issue").closest<HTMLElement>(".open-tab");
    if (!row) throw new Error("The draggable open-tab row was not rendered.");
    const target = collectionCard(container, "collection-reading");
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(actions.captureTabs).toHaveBeenCalledWith(
      "collection-reading",
      [501],
    ));
  });

  it("moves a saved tab between collections by drag and drop", async () => {
    const { actions, container } = renderApp();
    const row = screen.getByRole("link", { name: /React guide/ }).closest<HTMLElement>(".saved-tab");
    if (!row) throw new Error("The draggable saved-tab row was not rendered.");
    const target = collectionCard(container, "collection-reading");
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledWith({
      type: "savedTab.move",
      savedTabId: "saved-react",
      toCollectionId: "collection-reading",
      index: 0,
    }));
  });

  it("reorders collections by drag and drop", async () => {
    const { actions, container } = renderApp();
    const source = screen.getByRole("button", { name: "Drag Research" });
    const target = collectionCard(container, "collection-reading");
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledWith({
      type: "collection.reorder",
      collectionId: "collection-research",
      index: 1,
    }));
  });

  it("creates a session and passes the close-originals choice to captureTabs", async () => {
    const user = userEvent.setup();
    const workspace = createFakeWorkspace();
    const actions = createFakeActions(workspace);
    vi.mocked(actions.dispatch).mockResolvedValueOnce(createCommandResult(workspace, {
      kind: "created",
      id: "collection-session",
    }));
    renderApp({ actions, workspace });

    await user.click(screen.getByRole("button", { name: "Save this window" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: "Collection name" });
    await user.clear(name);
    await user.type(name, "Focused work");
    await user.click(within(dialog).getByRole("checkbox", { name: /Close originals/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save 2 tabs" }));

    await waitFor(() => expect(actions.dispatch).toHaveBeenCalledWith({
      type: "collection.create",
      spaceId: "space-personal",
      name: "Focused work",
      color: "mint",
    }));
    await waitFor(() => expect(actions.captureTabs).toHaveBeenCalledWith(
      "collection-session",
      [501, 502],
      true,
    ));
  });

  it("opens every tab in a collection through the collection action", async () => {
    const user = userEvent.setup();
    const { actions, container } = renderApp();
    const research = collectionCard(container, "collection-research");

    await user.click(within(research).getByRole("button", { name: "Open all" }));

    await waitFor(() => expect(actions.openCollection).toHaveBeenCalledWith("collection-research"));
  });

  it("deletes a collection and restores the pre-delete workspace on undo", async () => {
    const user = userEvent.setup();
    const { actions, container, workspace } = renderApp();
    const research = collectionCard(container, "collection-research");

    await user.click(within(research).getByLabelText("More actions for Research"));
    await user.click(within(research).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(actions.dispatch).toHaveBeenNthCalledWith(1, {
      type: "collection.delete",
      collectionId: "collection-research",
    }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(actions.dispatch).toHaveBeenCalledTimes(2);
    const undoCommand = vi.mocked(actions.dispatch).mock.calls[1]?.[0];
    expect(undoCommand).toMatchObject({ type: "workspace.import", mode: "replace" });
    if (undoCommand?.type !== "workspace.import") throw new Error("Undo did not import a backup.");
    expect(undoCommand.backup).toMatchObject({
      format: "hoby-workspace",
      version: 1,
      workspace,
    });
  });
});
