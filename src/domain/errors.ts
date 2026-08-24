export type DomainErrorCode =
  | "COLLECTION_NOT_FOUND"
  | "DUPLICATE_URL"
  | "IMPORT_INVALID"
  | "IMPORT_UNSUPPORTED"
  | "INVALID_COMMAND"
  | "INVALID_NAME"
  | "INVALID_URL"
  | "LAST_SPACE"
  | "SAVED_TAB_NOT_FOUND"
  | "SPACE_NOT_FOUND"
  | "WORKSPACE_INVALID"
  | "WORKSPACE_UNSUPPORTED";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
