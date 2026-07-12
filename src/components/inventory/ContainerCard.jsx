import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Printer, ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { renderQRSVGString } from "./QRCodeSVG";

export default function ContainerCard({ container, itemCount, location, homeLocation, project, onMove, onSelect, compact = false }) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;

  const handlePrintQR = (e) => {
    e.stopPropagation();
    let qrValue = container.qr_code_value;
    if (!qrValue) return;
    const qrSvg = renderQRSVGString(qrValue, 140);
    const html = `<!DOCTYPE html><html><head><title>Container Label</title><style>@page{size:4in 2in;margin:0.15in}body{font-family:Arial,sans-serif;margin:0;padding:8px}.label{display:flex;gap:12px;align-items:flex-start}.qr{flex-shrink:0}.info{flex:1}.name{font-size:18px;font-weight:bold;margin-bottom:4px}.type{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.code{font-size:24px;font-weight:bold;font-family:monospace;margin:6px 0}.loc{font-size:10px;color:#999;margin-top:4px}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${container.name}</div><div class="type">Container · ${tc.label}</div>${container.short_code ? `<div class="code">${container.short_code}</div>` : ''}${location ? `<div class="loc">${location.location_area}</div>` : ''}</div></div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=300');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
  };

  return (
    <div
      onClick={() => onSelect?.(container)}
      className={cn(
        "flex items-center gap-3 rounded-lg border transition-all cursor-pointer group",
        compact ? "p-2 bg-gray-800/30 border-gray-800 hover:border-indigo-800/50" : "p-3 bg-gray-900/40 border-gray-800 hover:border-indigo-700/50"
      )}
    >
      {/* Icon */}
      <div
        className={cn("rounded-lg flex items-center justify-center shrink-0", compact ? "w-8 h-8" : "w-10 h-10")}
        style={{ backgroundColor: displayColor + '15' }}
      >
        <TypeIcon className={cn(compact ? "w-4 h-4" : "w-5 h-5")} style={{ color: displayColor }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium text-white truncate group-hover:text-indigo-300 transition-colors", compact ? "text-xs" : "text-sm")}>{container.name}</span>
          {container.short_code && <span className="text-[10px] font-mono text-gray-500">[{container.short_code}]</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
          <span>{tc.label}</span>
          {itemCount > 0 && <span>· {itemCount} part{itemCount !== 1 ? 's' : ''}</span>}
          {container.status === 'empty' && <span className="text-yellow-500">· Empty</span>}
          {project && <span className="text-blue-400">· {project.name}</span>}
          {isAwayFromHome && (
            <span className="text-amber-400 flex items-center gap-0.5">
              · <Home className="w-2.5 h-2.5" /> away
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {onMove && (
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onMove(container); }} className="h-7 w-7 text-gray-500 hover:text-white md:opacity-0 md:group-hover:opacity-100">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={handlePrintQR} className="h-7 w-7 text-gray-500 hover:text-white md:opacity-0 md:group-hover:opacity-100">
          <Printer className="w-3.5 h-3.5" />
        </Button>
        <ChevronRight className="w-4 h-4 text-gray-600" />
      </div>
    </div>
  );
}