/**
 * dateUtils.js — Canonical date-only handling for Task dates.
 *
 * Task fields `start_date` and `due_date` are calendar dates (format: "date"
 * in the entity schema, stored as "YYYY-MM-DD"). They are NOT timestamps.
 *
 * Selecting July 22 must always display as July 22 regardless of timezone.
 *
 * RULES:
 * 1. NEVER use `new Date(dateStr)` or `parseISO(dateStr)` on a "YYYY-MM-DD"
 *    string — JS interprets it as UTC midnight, which shifts in negative
 *    UTC offsets (e.g. America/Chicago shows July 21 instead of July 22).
 *
 * 2. ALWAYS use `parseLocalDate(dateStr)` to convert a stored date string
 *    to a JS Date in the local timezone.
 *
 * 3. ALWAYS use `toDateString(date)` to convert a JS Date (from a calendar
 *    picker) to a "YYYY-MM-DD" string for saving to the entity.
 *
 * 4. ALWAYS use `formatCalendarDate(dateStr, pattern)` for display formatting
 *    from a stored string — it parses locally then formats.
 */

import { format } from "date-fns";

/**
 * Parse a date-only string ("YYYY-MM-DD" or ISO timestamp) into a local Date.
 * For "YYYY-MM-DD", constructs the date in the local timezone (no UTC shift).
 * For ISO timestamps (legacy data), extracts the date portion and constructs locally.
 * Returns null for null/undefined/empty/invalid values.
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  // Match YYYY-MM-DD at the start (covers both "2026-07-22" and "2026-07-22T00:00:00.000Z")
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Convert a JS Date object (e.g. from a calendar picker) to a canonical
 * "YYYY-MM-DD" string. Uses local date components — no UTC conversion.
 * Returns "" for null/undefined.
 */
export function toDateString(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a stored date string for display. Parses locally first.
 * Uses date-fns `format` on the local Date.
 * Returns fallback (default "—") for null/invalid values.
 *
 * @param {string} dateStr - Stored date string ("YYYY-MM-DD" or ISO)
 * @param {string} pattern - date-fns format pattern (default "PPP")
 * @param {string} fallback - Fallback string for null/invalid
 */
export function formatCalendarDate(dateStr, pattern = "PPP", fallback = "\u2014") {
  const d = parseLocalDate(dateStr);
  if (!d) return fallback;
  return format(d, pattern);
}