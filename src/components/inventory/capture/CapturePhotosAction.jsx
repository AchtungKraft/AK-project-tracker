import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import { fetchUnsortedPhotoCount } from "@/lib/quickCaptureUpload";
import QuickCaptureDialog from "./QuickCaptureDialog";

export function useUnsortedPhotoCount(containerId) {
  return useQuery({
    queryKey: ['storageUnsortedPhotos', containerId],
    queryFn: () => fetchUnsortedPhotoCount(containerId),
    staleTime: 20_000, refetchOnWindowFocus: false, retry: 1,
  });
}

/** Primary tote action: opens photo-first capture for this box only. */
export default function CapturePhotosAction({ container }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 h-9 text-sm bg-red-600 hover:bg-red-700 text-white">
        <Camera className="w-4 h-4" /> Capture Photos
      </Button>
      {open && <QuickCaptureDialog container={container} onClose={() => setOpen(false)} />}
    </>
  );
}

export function UnsortedPhotoBadge({ containerId }) {
  const { data: count, isLoading, isError } = useUnsortedPhotoCount(containerId);
  if (isLoading || isError || !count) return null;
  return (
    <span className="rounded bg-red-950/40 border border-red-800/50 px-2 py-1 text-red-200">
      {count} unsorted {count === 1 ? 'photo' : 'photos'}
    </span>
  );
}