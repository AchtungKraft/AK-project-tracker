import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Images } from "lucide-react";

/** Camera-first photo sources: a large Take Photo button and a library picker. */
export default function CaptureSourceButtons({ onFiles, disabled, takeLabel = 'Take Photo' }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const pick = (e) => { onFiles(e.target.files); e.target.value = ''; };
  return (
    <>
      <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={pick} />
      <input ref={libraryRef} hidden type="file" accept="image/*" multiple onChange={pick} />
      <Button onClick={() => cameraRef.current?.click()} disabled={disabled}
        className="w-full h-20 text-lg gap-3 bg-red-600 hover:bg-red-700">
        <Camera className="w-7 h-7" /> {takeLabel}
      </Button>
      <Button variant="outline" onClick={() => libraryRef.current?.click()} disabled={disabled}
        className="w-full h-12 gap-2 border-gray-700 text-gray-200">
        <Images className="w-5 h-5" /> Add From Library
      </Button>
    </>
  );
}