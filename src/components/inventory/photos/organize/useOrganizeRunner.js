import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";

/** Runs one organizing call, waits for this tote's views to reload, then reports and closes. */
export function useOrganizeRunner(containerId, onDone) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const refresh = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['storagePhotoGrid', containerId] }),
    qc.invalidateQueries({ queryKey: ['storedPropertyContainer', containerId] }),
    qc.invalidateQueries({ queryKey: ['storageLastOrganize', containerId] }),
    qc.invalidateQueries({ queryKey: ['storageMobileContainer', containerId] }),
    qc.invalidateQueries({ queryKey: ['storageMobileSearch'] }),
  ]).catch(() => {}), [qc, containerId]);
  const run = useCallback(async (fn, message) => {
    setBusy(true); setError(null);
    try {
      const result = await fn();
      await refresh();
      toast.success(typeof message === 'function' ? message(result) : message);
      onDone?.();
      return result;
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh, onDone]);
  return { busy, error, run };
}