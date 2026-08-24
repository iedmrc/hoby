import { useMemo, useState } from "react";

interface SiteIconProps {
  allowFavicon?: boolean;
  size?: number;
  title: string;
  url: string;
}

const swatches = ["#d9eae5", "#f9dfd4", "#dfe5f3", "#eee1f2", "#f2e8c9", "#dce8d2"];

function fallbackColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return swatches[Math.abs(hash) % swatches.length];
}

function faviconUrl(url: string, size: number) {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
  const endpoint = new URL(chrome.runtime.getURL("/_favicon/"));
  endpoint.searchParams.set("pageUrl", url);
  endpoint.searchParams.set("size", String(size * 2));
  return endpoint.toString();
}

export function SiteIcon({ allowFavicon = false, size = 30, title, url }: SiteIconProps) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(
    () => (allowFavicon && !failed ? faviconUrl(url, size) : null),
    [allowFavicon, failed, size, url],
  );
  const label = title.trim().charAt(0).toUpperCase() || "•";

  if (source) {
    return (
      <img
        alt=""
        className="site-icon"
        height={size}
        onError={() => setFailed(true)}
        src={source}
        width={size}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="site-icon site-icon--fallback"
      style={{ background: fallbackColor(url), height: size, width: size }}
    >
      {label}
    </span>
  );
}

