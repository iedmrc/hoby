import type { DomainErrorCode } from "../domain";

export type PlatformErrorCode =
  | "CAPTURE_PERMISSION_REQUIRED"
  | "MESSAGE_INVALID"
  | "MESSAGE_UNAVAILABLE"
  | "RECOVERY_EMPTY"
  | "STORAGE_FAILED"
  | "STORAGE_QUOTA"
  | "TAB_OPERATION_FAILED";

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: PlatformErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.details = details;
  }
}

export type ClientErrorCode = DomainErrorCode | PlatformErrorCode | "UNEXPECTED_ERROR";

export class ClientError extends Error {
  readonly code: ClientErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ClientErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ClientError";
    this.code = code;
    this.details = details;
  }
}
