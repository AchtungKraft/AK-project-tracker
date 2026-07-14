/**
 * Phase visual identity — semantic color mapping for recognized phase types.
 * Falls back to the bucket's stored hex color or a neutral default.
 */

const PHASE_SEMANTICS = {
  intake:       { bg: "bg-slate-700/30",   border: "border-slate-500/40",  text: "text-slate-300",   dot: "#94A3B8" },
  inspection:   { bg: "bg-slate-700/30",   border: "border-slate-500/40",  text: "text-slate-300",   dot: "#94A3B8" },
  disassembly:  { bg: "bg-orange-900/20",  border: "border-orange-600/30", text: "text-orange-300",  dot: "#F97316" },
  engineering:  { bg: "bg-cyan-900/20",    border: "border-cyan-600/30",   text: "text-cyan-300",    dot: "#06B6D4" },
  procurement:  { bg: "bg-violet-900/20",  border: "border-violet-600/30", text: "text-violet-300",  dot: "#8B5CF6" },
  parts:        { bg: "bg-violet-900/20",  border: "border-violet-600/30", text: "text-violet-300",  dot: "#8B5CF6" },
  fabrication:  { bg: "bg-amber-900/20",   border: "border-amber-600/30",  text: "text-amber-300",   dot: "#F59E0B" },
  metalwork:    { bg: "bg-amber-900/20",   border: "border-amber-600/30",  text: "text-amber-300",   dot: "#F59E0B" },
  surface:      { bg: "bg-rose-900/20",    border: "border-rose-600/30",   text: "text-rose-300",    dot: "#F43F5E" },
  paint:        { bg: "bg-rose-900/20",    border: "border-rose-600/30",   text: "text-rose-300",    dot: "#F43F5E" },
  body:         { bg: "bg-rose-900/20",    border: "border-rose-600/30",   text: "text-rose-300",    dot: "#F43F5E" },
  assembly:     { bg: "bg-blue-900/20",    border: "border-blue-600/30",   text: "text-blue-300",    dot: "#3B82F6" },
  electrical:   { bg: "bg-yellow-900/20",  border: "border-yellow-600/30", text: "text-yellow-300",  dot: "#EAB308" },
  interior:     { bg: "bg-emerald-900/20", border: "border-emerald-600/30",text: "text-emerald-300", dot: "#10B981" },
  upholstery:   { bg: "bg-emerald-900/20", border: "border-emerald-600/30",text: "text-emerald-300", dot: "#10B981" },
  testing:      { bg: "bg-teal-900/20",    border: "border-teal-600/30",   text: "text-teal-300",    dot: "#14B8A6" },
  detailing:    { bg: "bg-sky-900/20",     border: "border-sky-600/30",    text: "text-sky-300",     dot: "#0EA5E9" },
  exterior:     { bg: "bg-indigo-900/20",  border: "border-indigo-600/30", text: "text-indigo-300",  dot: "#6366F1" },
  delivery:     { bg: "bg-green-900/20",   border: "border-green-600/30",  text: "text-green-300",   dot: "#22C55E" },
  production:   { bg: "bg-blue-900/20",    border: "border-blue-600/30",   text: "text-blue-300",    dot: "#3B82F6" },
  custom:       { bg: "bg-purple-900/20",  border: "border-purple-600/30", text: "text-purple-300",  dot: "#A855F7" },
};

const NEUTRAL = { bg: "bg-gray-800/20", border: "border-gray-600/30", text: "text-gray-300", dot: "#6B7280" };

/**
 * Match a phase name to a semantic color family.
 * Checks if any keyword appears in the lowercased name.
 */
export function getPhaseColors(phaseName, bucketColor) {
  if (!phaseName) return NEUTRAL;
  const lower = phaseName.toLowerCase();
  for (const [keyword, colors] of Object.entries(PHASE_SEMANTICS)) {
    if (lower.includes(keyword)) return colors;
  }
  // Fallback to bucket color if available
  if (bucketColor) {
    return { ...NEUTRAL, dot: bucketColor };
  }
  return NEUTRAL;
}