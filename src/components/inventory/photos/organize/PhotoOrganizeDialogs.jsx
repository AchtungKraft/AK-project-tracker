import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStoredPropertyForContainer } from "@/components/inventory/ContainerStoredProperty";
import { newOpKey, organizePhotos, updateEntry } from "@/lib/photoOrganizeApi";
import { selectionInfo } from "./selectionInfo";
import { useOrganizeRunner } from "./useOrganizeRunner";
import GroupPhotosDialog from "./GroupPhotosDialog";
import SeparatePhotosDialog from "./SeparatePhotosDialog";
import EntryDetailsDialog from "./EntryDetailsDialog";
import IdentifyPartDialog from "./IdentifyPartDialog";
import OrganizeSheet from "./OrganizeSheet";

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const DONE = {
  group_new: (r) => `Grouped ${plural(r.moved, 'photo')} as one item`,
  group_existing: (r) => `Added ${plural(r.moved, 'photo')} to the item`,
  unsort: (r) => `Returned ${plural(r.moved, 'photo')} to Unsorted`,
  individual: (r) => `Created ${plural(r.created_entry_ids.length, 'individual item')}`,
};

/** Mounted once per opened action (keyed by it), so its op_key is stable across retries. */
export default function PhotoOrganizeDialogs({ containerId, dialog, photos, onClose, onDone }) {
  const info = useMemo(() => selectionInfo(photos), [photos]);
  const [opKey] = useState(newOpKey);
  const { busy, run } = useOrganizeRunner(containerId, onDone);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['storedPropertyContainer', containerId], queryFn: () => fetchStoredPropertyForContainer(containerId),
    staleTime: 20_000, refetchOnWindowFocus: false,
  });
  const active = entries.filter((e) => e.status === 'in_storage');
  const entry = info.singleEntryId ? active.find((e) => e.id === info.singleEntryId) : null;
  const organize = (payload) => run(
    () => organizePhotos(containerId, { ...payload, op_key: opKey, photo_ids: photos.map((p) => p.id) }),
    DONE[payload.operation],
  );

  if (dialog === 'group') return <GroupPhotosDialog info={info} entries={active} busy={busy} onSubmit={organize} onClose={onClose} />;
  if (dialog === 'separate') return <SeparatePhotosDialog info={info} busy={busy} onSubmit={organize} onClose={onClose} />;
  if (!entry) return <OrganizeSheet title={isLoading ? 'Loading item…' : 'Item not found'} onClose={onClose} />;
  if (dialog === 'details') {
    return <EntryDetailsDialog entry={entry} busy={busy} onClose={onClose}
      onSubmit={(patch) => run(() => updateEntry(containerId, entry.id, patch), 'Details saved')} />;
  }
  const group = info.groups[0];
  return <IdentifyPartDialog entryName={entry.name} linked={!!entry.catalog_part_id} currentPart={group?.part_name} busy={busy} onClose={onClose}
    onLink={(partId) => run(() => updateEntry(containerId, entry.id, { catalog_part_id: partId }),
      partId ? 'Identified as catalog part (identification only, not inventory)' : 'Part match removed')} />;
}