import type { ChromePermissionsLike } from "./chrome-api";

export const CAPTURE_PERMISSIONS = ["tabs", "favicon"] as const;

export interface CapturePermissionStatus {
  readonly favicon: boolean;
  readonly granted: boolean;
  readonly tabs: boolean;
}

export interface PermissionAdapter {
  getCaptureStatus(): Promise<CapturePermissionStatus>;
  requestCaptureAccess(): Promise<CapturePermissionStatus>;
}

export class ChromePermissionAdapter implements PermissionAdapter {
  constructor(private readonly permissions: ChromePermissionsLike) {}

  async getCaptureStatus(): Promise<CapturePermissionStatus> {
    const [tabs, favicon] = await Promise.all([
      this.permissions.contains({ permissions: ["tabs"] }),
      this.permissions.contains({ permissions: ["favicon"] }),
    ]);
    return { tabs, favicon, granted: tabs };
  }

  async requestCaptureAccess(): Promise<CapturePermissionStatus> {
    await this.permissions.request({ permissions: CAPTURE_PERMISSIONS });
    return this.getCaptureStatus();
  }
}

export class LocalPermissionAdapter implements PermissionAdapter {
  async getCaptureStatus(): Promise<CapturePermissionStatus> {
    return { tabs: false, favicon: false, granted: false };
  }

  async requestCaptureAccess(): Promise<CapturePermissionStatus> {
    return this.getCaptureStatus();
  }
}
