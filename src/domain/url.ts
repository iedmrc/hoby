import { DomainError } from "./errors";

export const MAX_URL_LENGTH = 4_096;

export interface NormalizedUrl {
  readonly href: string;
  readonly hostname: string;
}

/**
 * Normalization is intentionally conservative: URL fragments, path casing, and
 * query ordering can carry application state and are therefore preserved.
 */
export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new DomainError("INVALID_URL", "A URL is required.");
  }

  const explicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ||
    /^(?:about|chrome|chrome-extension|data|file|javascript|mailto):/i.test(trimmed);
  const withScheme = explicitScheme ? trimmed : `https://${trimmed}`;

  if (withScheme.length > MAX_URL_LENGTH) {
    throw new DomainError("INVALID_URL", "The URL is too long.");
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new DomainError("INVALID_URL", "Enter a valid HTTP or HTTPS URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DomainError("INVALID_URL", "Only HTTP and HTTPS URLs can be saved.");
  }

  if (parsed.username || parsed.password) {
    throw new DomainError(
      "INVALID_URL",
      "URLs containing embedded credentials cannot be saved.",
    );
  }

  if (!parsed.hostname) {
    throw new DomainError("INVALID_URL", "The URL must include a hostname.");
  }

  // URL already lowercases schemes/hosts and removes default ports. Remove only
  // the semantically redundant root slash; non-root trailing slashes are kept.
  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    parsed.pathname = "";
  }

  const href = parsed.href.endsWith("/") && parsed.pathname === "/"
    ? parsed.href.slice(0, -1)
    : parsed.href;

  if (href.length > MAX_URL_LENGTH) {
    throw new DomainError("INVALID_URL", "The normalized URL is too long.");
  }

  return { href, hostname: parsed.hostname };
}

export function normalizeUrlKey(input: string): string {
  return normalizeUrl(input).href;
}

export function isNormalizedHttpUrl(input: string): boolean {
  try {
    return normalizeUrlKey(input) === input;
  } catch {
    return false;
  }
}

export function defaultTitleForUrl(url: string): string {
  return normalizeUrl(url).hostname;
}
