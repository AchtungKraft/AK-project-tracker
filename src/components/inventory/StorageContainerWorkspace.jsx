import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ContainerDetailPanel from "./ContainerDetailPanel";

/**
 * Large, task-focused box workspace. Desktop container selection should not
 * force full photo intake and property editing into a 260px Inspector sidebar.
 * Reuses the existing ContainerDetailPanel's canonical move and print callbacks;
 * this component introduces zero writes or new inventory logic.
 */
export default function StorageContainerWorkspace({
  container, onClose, locations=[], inventoryItems=[], parts=[], projects=[], vendors=[],
  onMove, onReturnHome, onAddParts, onEmptyContainer, onMoveFromContainer,
  onPartClick, onOpenGallery, partActions, getInventoryStats, getInventoryItemId,
}) {
  if (!container) return null;
  return <Dialog open onOpenChange={open=>{if(!open)onClose?.()}}>
    <DialogContent className="w-[calc(100vw-16px)] max-w-6xl h-[min(92dvh,900px)] max-h-[92dvh] bg-[#101827] border-indigo-900/60 text-white p-0 gap-0 overflow-hidden flex flex-col">
      <DialogTitle className="sr-only">Box contents: {container.name || container.short_code}</DialogTitle>
      <div className="flex-1 min-h-0 overflow-hidden pt-1">
        <ContainerDetailPanel
          key={container.id}
          container={container} locations={locations} inventoryItems={inventoryItems}
          parts={parts} projects={projects} vendors={vendors}
          onClose={onClose} onMove={onMove} onReturnHome={onReturnHome}
          onAddParts={onAddParts} onEmptyContainer={onEmptyContainer}
          onMoveFromContainer={onMoveFromContainer} onPartClick={onPartClick}
          onOpenGallery={onOpenGallery} partActions={partActions}
          getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId}
          workspaceMode
        />
      </div>
    </DialogContent>
  </Dialog>;
}
