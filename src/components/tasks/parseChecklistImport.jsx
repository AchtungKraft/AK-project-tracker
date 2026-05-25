/**
 * parseChecklistImport - Parse multi-line text into structured checklist items.
 *
 * Supports: plain lines, bullets (•-*), numbered lists (1.), checkbox syntax ([x] [ ] ☑ ☐ ✅)
 * Returns: Array of { label: string, completed: boolean }
 */

const CHECKBOX_CHECKED = /^\s*(\[x\]|\[X\]|☑|✅)\s*/;
const CHECKBOX_UNCHECKED = /^\s*(\[\s?\]|☐)\s*/;
const PREFIX_STRIP = /^\s*(?:[-\u2022*]|\d+[.)]\s*|\[x\]|\[X\]|\[\s?\]|☐|☑|✅)\s*/i;

export default function parseChecklistImport(text) {
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const results = [];
  let prevLabel = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const completed = CHECKBOX_CHECKED.test(trimmed);
    const label = trimmed.replace(PREFIX_STRIP, '').trim();

    if (!label) continue;

    // Dedupe adjacent duplicates
    if (label === prevLabel) continue;
    prevLabel = label;

    results.push({ label, completed });
  }

  return results;
}