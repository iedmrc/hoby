import { DomainError, isNormalizedHttpUrl, normalizeUrl } from "../../src/domain";

describe("normalizeUrl", () => {
  it("adds HTTPS, normalizes host casing and default ports, and removes a root slash", () => {
    expect(normalizeUrl("  EXAMPLE.com:443  ").href).toBe("https://example.com");
    expect(normalizeUrl("http://EXAMPLE.com:80/").href).toBe("http://example.com");
  });

  it("preserves meaningful paths, query order, and fragments", () => {
    expect(normalizeUrl("https://example.com/App/?b=2&a=1#route").href).toBe(
      "https://example.com/App/?b=2&a=1#route",
    );
  });

  it.each(["chrome://settings", "file:///tmp/a", "javascript:alert(1)", "mailto:a@b.com"])(
    "rejects unsupported protocol %s",
    (input) => {
      expect(() => normalizeUrl(input)).toThrow(DomainError);
    },
  );

  it("rejects embedded credentials and empty input", () => {
    expect(() => normalizeUrl("https://user:secret@example.com")).toThrow(
      "embedded credentials",
    );
    expect(() => normalizeUrl("   ")).toThrow("required");
  });

  it("identifies only values already in canonical form", () => {
    expect(isNormalizedHttpUrl("https://example.com/path")).toBe(true);
    expect(isNormalizedHttpUrl("example.com/path")).toBe(false);
    expect(isNormalizedHttpUrl("chrome://newtab")).toBe(false);
  });
});
