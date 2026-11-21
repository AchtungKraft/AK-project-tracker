import { useNavigate } from "react-router-dom";
import { savePrintJob } from "@/lib/mobileLabelPrint";

/**
 * Returns the Storage Mobile print handler: saves the labels (and what to restore on return) and
 * opens the dedicated print page. `job`: { title, returnTo, source?, drafts?, batchCode? }.
 */
export function useOpenStickerPrint(job) {
  const navigate = useNavigate();
  return (labels) => {
    savePrintJob({ ...job, labels });
    navigate('/storage/print');
    return true;
  };
}