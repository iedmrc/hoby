import { ChromePermissionAdapter, LocalPermissionAdapter } from "../../src/platform";
import { FakePermissions } from "./fakes";

describe("permission adapters", () => {
  it("requests tabs and favicon together and verifies the resulting state", async () => {
    const chrome = new FakePermissions();
    const adapter = new ChromePermissionAdapter(chrome);
    expect(await adapter.getCaptureStatus()).toEqual({
      tabs: false,
      favicon: false,
      granted: false,
    });
    expect(await adapter.requestCaptureAccess()).toEqual({
      tabs: true,
      favicon: true,
      granted: true,
    });
  });

  it("keeps local preview capabilities denied without throwing", async () => {
    await expect(new LocalPermissionAdapter().requestCaptureAccess()).resolves.toEqual({
      tabs: false,
      favicon: false,
      granted: false,
    });
  });
});
