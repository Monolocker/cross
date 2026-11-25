// Links from outside sources (Milestone 28.0). Only http(s) URLs with a
// host become clickable: "javascript:" or "data:" links would run in
// this page, which holds the trading key.
export function safeHref(url: string | null | undefined): string | null {
  if (url === null || url === undefined) {
    return null
  }
  try {
    const parsed = new URL(url.trim())
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host !== '' ? parsed.href : null
  } catch {
    return null  // not an absolute URL
  }
}
