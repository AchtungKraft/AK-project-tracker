import { useState } from "react";
import { Link } from "react-router-dom";
import StorageGate from "@/components/storageMobile/StorageGate";
import StorageHomeActions from "@/components/storageMobile/StorageHomeActions";
import RecentTotes from "@/components/storageMobile/RecentTotes";
import ToteScanner from "@/components/storageMobile/ToteScanner";

/** Storage Mobile home: scan, find, capture, move. Loads only the user's recent totes. */
export default function StorageMobile() {
  const [scan, setScan] = useState(null); // null = closed, { act }
  return (
    <StorageGate>
      <div className="mx-auto w-full max-w-xl space-y-5 pb-4">
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-bold text-white">Storage</h1>
          <Link to="/partstracker?tab=locations" className="text-xs text-gray-400 underline-offset-2 hover:underline">Full Locations</Link>
        </div>
        <StorageHomeActions onScan={(act) => setScan({ act })} />
        <RecentTotes />
      </div>
      {scan && <ToteScanner act={scan.act} onClose={() => setScan(null)} />}
    </StorageGate>
  );
}