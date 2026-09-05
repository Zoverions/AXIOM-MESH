/**
 * Pure deterministic local organizer shared by Mesh and AXIOM One.
 * No network, no Node/browser crypto. Identical algorithm for both surfaces.
 */

const DEFAULT_MAX_INPUT = 8_000;
const DEFAULT_MAX_OUTPUT = 4_000;

/**
 * Deterministic organize/summarize of owner-selected text.
 * Normalizes whitespace, extracts markdown-style headings and bullets,
 * and truncates with explicit bounds.
 */
export function organizeSelectedText(text, {
  maxInputChars = DEFAULT_MAX_INPUT,
  maxOutputChars = DEFAULT_MAX_OUTPUT
} = {}) {
  if (typeof text !== 'string' || text.length < 1) {
    throw new TypeError('organizeSelectedText requires non-empty text');
  }
  if (!Number.isInteger(maxInputChars) || maxInputChars < 1) {
    throw new TypeError('maxInputChars is invalid');
  }
  if (!Number.isInteger(maxOutputChars) || maxOutputChars < 1) {
    throw new TypeError('maxOutputChars is invalid');
  }

  const truncatedInput = text.length > maxInputChars;
  const source = truncatedInput ? text.slice(0, maxInputChars) : text;
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const headings = [];
  const bullets = [];
  const body = [];

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      headings.push(heading[1].trim());
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1].trim());
      continue;
    }
    body.push(line);
  }

  const title = headings[0]
    || (body[0] ? clip(body[0], 120) : 'Organized note draft');

  const summaryParts = [];
  if (headings.length) {
    summaryParts.push(`Headings (${headings.length}): ${headings.slice(0, 8).join('; ')}`);
  }
  if (bullets.length) {
    summaryParts.push(`Bullets (${bullets.length}):`);
    for (const item of bullets.slice(0, 12)) {
      summaryParts.push(`- ${item}`);
    }
  }
  if (body.length) {
    summaryParts.push('Body:');
    summaryParts.push(body.join('\n'));
  }
  if (!summaryParts.length) {
    summaryParts.push(normalized || '(empty after normalization)');
  }

  let summaryText = summaryParts.join('\n');
  let truncated = truncatedInput;
  if (summaryText.length > maxOutputChars) {
    summaryText = `${summaryText.slice(0, Math.max(0, maxOutputChars - 1))}…`;
    truncated = true;
  }

  return Object.freeze({
    title,
    headings: Object.freeze(headings.slice(0, 32)),
    bullets: Object.freeze(bullets.slice(0, 64)),
    summary_text: summaryText,
    truncated,
    char_count: summaryText.length
  });
}

function clip(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}