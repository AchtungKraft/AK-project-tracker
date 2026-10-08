import React from 'react';
import { ExternalLink } from 'lucide-react';

const COMMS_URL = 'https://comms.achtungkraft.com/';

export default function CommsEmbed() {
  return (
    <div className="flex w-full min-h-0 flex-col" style={{ height: 'calc(100dvh - 72px)' }}>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-black/40 px-4 py-2">
        <h1 className="text-lg font-semibold text-white">COMMS</h1>
        <a href={COMMS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white"><ExternalLink className="h-4 w-4" />Open Full COMMS</a>
      </div>
      <iframe data-ak-comms-embed="true" title="AK COMMS" src={`${COMMS_URL}?embed=true`} className="min-h-0 w-full flex-1 border-0" allow="clipboard-read; clipboard-write; microphone; camera" />
    </div>
  );
}
