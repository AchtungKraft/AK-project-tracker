import { Link } from "react-router-dom";
import { ScanLine, Search, Camera, ArrowRightLeft } from "lucide-react";

const tile = "flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 min-h-[104px] text-left active:scale-[0.98] transition-transform";

/** The four everyday Storage actions, sized for thumbs on small iPhones. */
export default function StorageHomeActions({ onScan }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={() => onScan()} className={`${tile} border-red-700 bg-red-600 text-white`}>
        <ScanLine className="w-7 h-7" />
        <span className="text-base font-semibold leading-tight">Scan Tote</span>
      </button>
      <Link to="/storage/find" className={`${tile} border-gray-700 bg-gray-900 text-white`}>
        <Search className="w-7 h-7 text-gray-300" />
        <span className="text-base font-semibold leading-tight">Find Storage</span>
      </Link>
      <button onClick={() => onScan('capture')} className={`${tile} border-gray-700 bg-gray-900 text-white`}>
        <Camera className="w-7 h-7 text-gray-300" />
        <span className="text-base font-semibold leading-tight">Quick Capture</span>
      </button>
      <button onClick={() => onScan('move')} className={`${tile} border-gray-700 bg-gray-900 text-white`}>
        <ArrowRightLeft className="w-7 h-7 text-gray-300" />
        <span className="text-base font-semibold leading-tight">Move / Put Away</span>
      </button>
    </div>
  );
}