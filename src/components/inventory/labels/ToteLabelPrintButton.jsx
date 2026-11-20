import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import ToteLabelPrintDialog from "./ToteLabelPrintDialog";

/**
 * The single-container Print action. Opens the shared V2 label studio.
 * The wrapper stops clicks (including from the portal dialog) reaching clickable parent cards.
 */
export default function ToteLabelPrintButton({ container, locations, children, className, size = "icon", variant = "ghost", title = "Print Label" }) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} className="contents">
      <Button size={size} variant={variant} onClick={() => setOpen(true)} className={className} title={title}>
        {children || <Printer className="w-4 h-4" />}
      </Button>
      {open && <ToteLabelPrintDialog container={container} locations={locations} onClose={() => setOpen(false)} />}
    </span>
  );
}