import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";

/** Runs one organizing call, shows the outcome, and refreshes this tote's photo views. */
export function useOrganizeRunner(containerId, onDone) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['storagePhotoGrid', containerId] });
    qc.invalidateQueries({ queryKey: ['storedPropertyContainer', containerId] });
    qc.invalidateQueries({ queryKey: ['storageLastOrganize', containerId] });
  }, [qc, containerId]);
  const run = useCallback(async (fn, message) => {
    setBusy(true);
    try {
      const result = await fn();
      toast.success(typeof message === 'function' ? message(result) : message);
      refresh();
      onDone?.();
      return result;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh, onDone]);
  return { busy, run };
}