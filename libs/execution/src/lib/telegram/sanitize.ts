const TELEGRAM_MESSAGE_LIMIT = 4096;

// Telegram's HTML parse mode whitelist. Everything else gets escaped.
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'a']);

/** "Here's a post about X:" prefixed to the real content — strip a short first line ending in a colon. */
export function stripPreamble(text: string): string {
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1) {
    return text;
  }

  const firstLine = text.slice(0, newlineIndex).trim();
  if (firstLine.length > 0 && firstLine.length <= 80 && firstLine.endsWith(':')) {
    return text.slice(newlineIndex + 1).trim();
  }

  return text;
}

/** Models wrap output in triple backticks reliably despite instructions not to — strip unconditionally. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

/**
 * Escapes everything, then re-opens a small whitelist of Telegram HTML
 * tags. Cheaper and more forgiving than requiring valid MarkdownV2, where a
 * single unescaped character fails the entire send.
 */
export function sanitizeHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return escaped.replace(/&lt;(\/?)(\w+)((?:\s+\w+="[^"]*")*)\s*&gt;/g, (match, closingSlash, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return match;
    }

    if (tag === 'a' && closingSlash === '') {
      const hrefMatch = /href="([^"]*)"/.exec(attrs);
      return hrefMatch ? `<a href="${hrefMatch[1]}">` : '<a>';
    }

    return `<${closingSlash}${tag}>`;
  });
}

/** Full pipeline applied to any text before it reaches Telegram. */
export function sanitizeOutput(text: string): string {
  return sanitizeHtml(stripCodeFences(stripPreamble(text)));
}

/** Paragraph boundaries first, sentence boundaries second, hard cut as last resort. */
export function splitForTelegram(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let cut = findBoundary(remaining, limit, /\n\s*\n/g);
    if (cut <= 0) {
      cut = findBoundary(remaining, limit, /(?<=[.!?])\s+/g);
    }
    if (cut <= 0) {
      cut = limit;
    }

    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

/** Furthest boundary match that still lands at or before `limit`, or -1 if none does. */
function findBoundary(text: string, limit: number, boundaryRegex: RegExp): number {
  let lastIndex = -1;
  for (const match of text.matchAll(boundaryRegex)) {
    const boundaryEnd = match.index + match[0].length;
    if (boundaryEnd > limit) {
      break;
    }
    lastIndex = boundaryEnd;
  }
  return lastIndex;
}
