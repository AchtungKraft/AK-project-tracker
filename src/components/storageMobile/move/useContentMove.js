import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { moveContents } from "@/lib/contentMoveApi";

/** Runs one content move and refreshes both totes. */
export function useContentMove(sourceId) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async ({ opKey, destinationId, entryIds, photoIds }) => {
    setBusy(true); setError(null);
    try {
      const r = await moveContents({ opKey, sourceId, destinationId, entryIds, photoIds });
      for (const id of [sourceId, destinationId]) {
        qc.invalidateQueries({ queryKey: ['storagePhotoGrid', id] });
        qc.invalidateQueries({ queryKey: ['storedPropertyContainer', id] });
        qc.invalidateQueries({ queryKey: ['storageMobileContainer', id] });
        qc.invalidateQueries({ queryKey: ['storageLastOrganize', id] });
        qc.invalidateQueries({ queryKey: ['storageContentMoves', id] });
        qc.invalidateQueries({ queryKey: ['storageUnsortedPhotos', id] });
      }
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