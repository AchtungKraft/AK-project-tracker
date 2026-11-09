import React from "react";
import ExcelEmbedFrame from "./ExcelEmbedFrame";
import { splitBodySegments, normalizeEmbeds } from "@/lib/excelEmbeds";

// Renders a request description with embeds in place. Text segments use the caller's existing
// renderer (renderText) so current rich-text / plain-text output stays unchanged.
export default function RequestBodyContent({ body, embeds, renderText }) {
  const valid = normalizeEmbeds(body, embeds);
  if (valid.length === 0) return renderText(body || "", "all");
  return (
    <div className="min-w-0">
      {splitBodySegments(body, valid).map((s, i) =>
        s.type === "embed"
          ? <ExcelEmbedFrame key={s.embed.id} embed={s.embed} />
          : <React.Fragment key={`t${i}`}>{renderText(s.value.replace(/^\n+|\n+$/g, ""), i)}</React.Fragment>
      )}
    </div>
  );
}