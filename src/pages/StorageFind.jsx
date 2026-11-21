import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ScanLine, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StorageGate from "@/components/storageMobile/StorageGate";
import SearchResults from "@/components/storageMobile/SearchResults";
import RecentTotes from "@/components/storageMobile/RecentTotes";
import ToteScanner from "@/components/storageMobile/ToteScanner";
import { useDebounced } from "@/components/storageMobile/useDebounced";

const HINT = { capture: 'Pick a tote to capture photos', move: 'Pick a tote to move' };

export default function StorageFind() {
  const act = new URLSearchParams(useLocation().search).get('do') || undefined;
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const q = useDebounced(text.trim(), 300);
  return (
    <StorageGate>
      <div className="mx-auto w-full max-w-xl space-y-4 pb-4">
        <div className="flex items-center gap-2">
          <Link to="/storage" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 active:bg-gray-800" aria-label="Back to Storage">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Find storage…" enterKeyHint="search"
              className="h-12 pl-11 pr-10 text-base bg-gray-900 border-gray-700 text-white" />
            {text && <button onClick={() => setText('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500" aria-label="Clear"><X className="w-4 h-4" /></button>}
          </div>
          <Button size="icon" variant="outline" onClick={() => setScanning(true)} className="h-12 w-12 shrink-0" aria-label="Scan tote">
            <ScanLine className="w-5 h-5" />
          </Button>
        </div>
        {act && HINT[act] && <p className="text-sm text-red-300">{HINT[act]}</p>}
        <SearchResults q={q} act={act} />
        {q.length < 2 && <RecentTotes act={act} />}
      </div>
      {scanning && <ToteScanner act={act} onClose={() => setScanning(false)} />}
    </StorageGate>
  );
}