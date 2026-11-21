import { itemActions } from "../actions/storageActions";
import ActionButtons from "../actions/ActionButtons";

/** Item actions from the shared definitions, so they match every other entry point. */
export default function EntryDetailActions({ item, onAction }) {
  const actions = itemActions({ size: item.photo_count, identified: item.identified, tracked: item.inventory_linked });
  return (
    <div className="space-y-1.5">
      <ActionButtons actions={actions} onAction={onAction} size="lg" />
      {item.inventory_linked && <p className="text-[11px] text-amber-300">This item is tracked inventory. Move or change its stock from Parts Tracker.</p>}
    </div>
  );
}