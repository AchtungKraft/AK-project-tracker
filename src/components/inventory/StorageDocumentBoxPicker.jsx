import { useMemo, useState } from "react";
import { Camera, MapPin, Package, Printer, ScanLine, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildLocationPathString } from "./locationTypeConfig";

/**
 * Non-camera, shop-first entry into physical property intake.
 * This is intentionally a chooser: selecting a box opens PropertyIntakeModal,
 * not AddInventoryModal, receiving, or any stock transfer.
 */
export default function StorageDocumentBoxPicker({
  containers = [], locations = [], projects = [], isAdmin = false,
  onChooseBox, onScan, onPrintLabels, onClose,
}) {
  const [search, setSearch] = useState("");
  const locationById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const activeBoxes = useMemo(() => containers.filter(c => c.active !== false &&
    c.status !== "archived" && c.status !== "reserved"), [containers]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return activeBoxes.filter(c => !q || [
      c.name, c.short_code, c.qr_code_value, c.description,
      locationById.get(c.location_id)?.location_area,
      projectById.get(c.project_id)?.name,
    ].some(v => String(v || "").toLocaleLowerCase().includes(q)))
      .sort((a, b) => String(a.short_code || a.name || "").localeCompare(String(b.short_code || b.name || "")))
      .slice(0, 150);
  }, [activeBoxes, search, locationById, projectById]);
  return <Dialog open onOpenChange={open => { if (!open) onClose?.(); }}>
    <DialogContent className="w-[calc(100vw-16px)] max-w-2xl max-h-[90dvh] overflow-hidden p-4 sm:p-6 flex flex-col bg-gray-900 border-gray-700 text-white">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-300"/> Document Box Contents
        </DialogTitle>
      </DialogHeader>
      <p className="text-xs text-gray-400">
        Photograph client parts, take-offs, and miscellaneous contents without adding them to stock inventory.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
        <Button onClick={onScan} className="h-11 bg-indigo-700 hover:bg-indigo-800 gap-2">
          <ScanLine className="w-4 h-4"/> Scan Box QR
        </Button>
        {isAdmin && <Button variant="outline" onClick={onPrintLabels} className="h-11 border-gray-700 gap-2">
          <Printer className="w-4 h-4"/> Print Batch Box Labels
        </Button>}
      </div>
      <div className="relative shrink-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Find existing box by name, number, project, or shelf"
          className="h-11 pl-10 bg-gray-950 border-gray-700" autoFocus/>
        {search && <button type="button" aria-label="Clear box search" onClick={() => setSearch("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-4 h-4"/></button>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2">
        <p className="text-xs text-gray-400 font-medium">
          Choose an existing box ({filtered.length}{activeBoxes.length > 150 && !search ? " shown" : ""})
        </p>
        {filtered.map(box => {
          const loc = locationById.get(box.location_id);
          const project = projectById.get(box.project_id);
          return <button key={box.id} type="button" onClick={() => onChooseBox?.(box)}
            className="w-full text-left flex gap-3 items-center p-3 rounded-lg border border-gray-700 bg-gray-950/60 hover:border-indigo-500 hover:bg-gray-800/70 min-w-0">
            <Package className="w-5 h-5 shrink-0 text-indigo-300"/>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm text-white break-words">{box.short_code ? `${box.short_code} · ` : ""}{box.name || "Unlabeled box"}</span>
              <span className="block text-xs text-gray-400 mt-1 break-words">{project?.name || (box.client_account_id ? "Client-owned property" : "Ownership not recorded")}</span>
              <span className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                <MapPin className="w-3 h-3 shrink-0"/>
                <span className="truncate">{loc ? buildLocationPathString(loc.id, locations) : "Location not assigned"}</span>
              </span>
            </span>
            <Camera className="w-4 h-4 text-indigo-300 shrink-0"/>
          </button>;
        })}
        {activeBoxes.length === 0 && <div className="border border-dashed border-indigo-900 rounded-lg p-4 space-y-2 text-sm text-gray-300">
          <p className="font-semibold text-white">No active boxes are available yet.</p>
          <p>Print a batch of box QR labels, attach one to a box, then scan it to assign its owner and location. Once activated, you can photograph its contents here.</p>
          <p className="text-xs text-gray-500">You can also create a container from a physical location in the Locations workspace.</p>
        </div>}
        {activeBoxes.length > 0 && filtered.length === 0 && <p className="text-sm text-gray-500 p-6 text-center">No matching boxes. Try a different name, box code, or location.</p>}
      </div>
      <div className="shrink-0 border-t border-gray-700 pt-3" style={{paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
        <Button variant="outline" className="w-full h-10" onClick={onClose}>Close</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
