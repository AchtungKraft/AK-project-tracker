import { useMemo } from "react";
import { buildToteLabelDocument, paginate } from "./toteLabelDocument";

// Renders the exact print document in a scaled frame (8.5 × 11 in pages at 96 px/in).
const PAGE_W = 816, PAGE_H = 1056, PAGE_GAP = 19, PAD = 19, SCALE = 0.62;

export default function ToteLabelPreview({ labels }) {
  const html = useMemo(() => buildToteLabelDocument(labels), [labels]);
  const pages = paginate(labels).length;
  const height = PAD * 2 + pages * (PAGE_H + PAGE_GAP);
  return (
    <div className="rounded-md border border-gray-700 bg-gray-300 overflow-auto max-h-[55vh]">
      <div style={{ width: PAGE_W * SCALE + 16, height: height * SCALE }}>
        <iframe
          title="Label print preview"
          srcDoc={html}
          scrolling="no"
          style={{ width: PAGE_W + 26, height, border: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}
        />
      </div>
    </div>
  );
}