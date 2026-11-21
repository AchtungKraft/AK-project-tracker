import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { moveContents } from "@/lib/contentMoveApi";

const PER_TOTE = ['storagePhotoGrid', 'storedPropertyContainer', 'storageMobileContainer', 'storageLastOrganize', 'storageContentMoves', 'storageUnsortedPhotos'];

/** Runs one content move, then waits for both totes (and search) to reload before reporting success. */
export function useContentMove(sourceId) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async ({ opKey, destinationId, entryIds, photoIds }) => {
    setBusy(true); setError(null);
    try {
      const r = await moveContents({ opKey, sourceId, destinationId, entryIds, photoIds });
      await Promise.all([
        ...[sourceId, destinationId].flatMap((id) => PER_TOTE.map((k) => qc.invalidateQueries({ queryKey: [k, id] }))),
        qc.invalidateQueries({ queryKey: ['storageMobileSearch'] }),
      ]).catch(() => {});
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [qc, sourceId]);
  return { busy, error, run };
}