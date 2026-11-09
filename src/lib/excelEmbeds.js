// Microsoft Excel (OneDrive / SharePoint) embeds for Feedback Requests.
// Embeds are stored as structured records on the request (`embeds`), and placed in the
// description with a text token "[[excel:<id>]]". Never stored or rendered as raw HTML.
// Keep the allow-list in sync with base44/functions/{createFeedbackRequest,publicClientRequestDetail}.

export const EMBED_DEFAULT_HEIGHT = 600;
export const EMBED_MIN_HEIGHT = 200;
export const EMBED_MAX_HEIGHT = 1600;
export const EMBED_MAX_COUNT = 10;
export const EMBED_TOKEN_RE = /\[\[excel:([a-z0-9]{8,16})\]\]/g;

export const embedToken = (id) => `[[excel:${id}]]`;
export const newEmbedId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
export const clampHeight = (h) => Math.min(EMBED_MAX_HEIGHT, Math.max(EMBED_MIN_HEIGHT, Math.round(Number(h) || EMBED_DEFAULT_HEIGHT)));

const decodeEntities = (s) => s.replace(/&amp;|&#38;/g, "&").replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'");

/** Approved Microsoft embedding endpoints. Returns true only for https URLs on these hosts/paths. */
export function isAllowedEmbedUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4000) return false;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (host === "onedrive.live.com") return path.startsWith("/embed");
  if (host === "1drv.ms") return path.startsWith("/x/");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.sharepoint\.com$/.test(host)) {
    return path.includes("/_layouts/15/doc.aspx") || path.includes("/_layouts/15/embed.aspx") || path.startsWith("/:x:/");
  }
  if (host === "excel.officeapps.live.com") return path.startsWith("/x/_layouts/");
  if (host === "view.officeapps.live.com") return path === "/op/embed.aspx" || path === "/op/view.aspx";
  return false;
}

/** Accepts a URL or a full <iframe> embed code. Returns { url, title } or { error }. */
export function parseEmbedInput(input) {
  const text = String(input || "").trim();
  if (!text) return { error: "Paste an Excel embed URL or iframe code." };
  let src = text, title = "";
  if (text.startsWith("<")) {
    const frames = text.match(/<iframe\b/gi) || [];
    if (frames.length !== 1) return { error: "Paste exactly one iframe embed code." };
    const m = text.match(/<iframe\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!m) return { error: "No iframe src found in the embed code." };
    src = decodeEntities(m[2].trim());
    const t = text.match(/<iframe\b[^>]*?\btitle\s*=\s*(["'])(.*?)\1/i);
    title = t ? decodeEntities(t[2]).trim().slice(0, 120) : "";
  }
  if (!isAllowedEmbedUrl(src)) return { error: "Only Microsoft OneDrive, SharePoint, or Excel embed links are allowed." };
  return { url: new URL(src).toString(), title };
}

/** Link for "Open in Excel": SharePoint embed views open in normal view; others open as-is. */
export function openInExcelUrl(url) {
  if (!isAllowedEmbedUrl(url)) return null;
  const u = new URL(url);
  if (u.searchParams.get("action") === "embedview") u.searchParams.set("action", "view");
  return u.toString();
}

/** Keep only valid embeds that the body still references, in body order; clamp heights. */
export function normalizeEmbeds(body, embeds) {
  const list = Array.isArray(embeds) ? embeds : [];
  const byId = new Map(list.filter(e => e && isAllowedEmbedUrl(e.url)).map(e => [e.id, e]));
  const out = [];
  for (const m of String(body || "").matchAll(EMBED_TOKEN_RE)) {
    const e = byId.get(m[1]);
    if (e && !out.some(o => o.id === e.id)) out.push({ id: e.id, url: e.url, title: String(e.title || "").slice(0, 120), height: clampHeight(e.height) });
  }
  return out.slice(0, EMBED_MAX_COUNT);
}

/** Split a description into ordered text and embed segments for rendering. */
export function splitBodySegments(body, embeds) {
  const byId = new Map((embeds || []).map(e => [e.id, e]));
  const text = String(body || "");
  const segs = [];
  let last = 0;
  for (const m of text.matchAll(EMBED_TOKEN_RE)) {
    const e = byId.get(m[1]);
    if (!e) continue;
    if (m.index > last) segs.push({ type: "text", value: text.slice(last, m.index) });
    segs.push({ type: "embed", embed: e });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });
  return segs.filter(s => s.type === "embed" || s.value.trim());
}

/** Plain-text version for previews/search snippets. */
export const stripEmbedTokens = (body) => String(body || "").replace(EMBED_TOKEN_RE, "[Excel workbook]");