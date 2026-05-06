import React from "react";
import { AlertTriangle, Info, CheckSquare, Square, ExternalLink, FileText, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function TextBlock({ data }) {
  return <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{data.text}</div>;
}

function HeadingBlock({ data }) {
  const Tag = data.level === 1 ? 'h2' : data.level === 2 ? 'h3' : 'h4';
  const sizes = { 1: 'text-lg font-bold', 2: 'text-base font-semibold', 3: 'text-sm font-semibold' };
  return <Tag className={cn("text-white mt-4 mb-1", sizes[data.level] || sizes[3])}>{data.text}</Tag>;
}

function ChecklistBlock({ data }) {
  return (
    <div className="space-y-1 my-2">
      {(data.items || []).map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          {item.checked 
            ? <CheckSquare className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
            : <Square className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" />
          }
          <span className={cn("text-gray-300", item.checked && "line-through text-gray-500")}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function ImageBlock({ data }) {
  return (
    <div className="my-3">
      <img 
        src={data.url} 
        alt={data.caption || ''} 
        className="rounded-lg max-h-80 object-contain bg-gray-800"
      />
      {data.caption && <p className="text-xs text-gray-500 mt-1">{data.caption}</p>}
    </div>
  );
}

function GalleryBlock({ data }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 my-3">
      {(data.images || []).map((img, i) => (
        <img key={i} src={img.url || img} alt={img.caption || ''} className="rounded-lg object-cover h-32 w-full bg-gray-800" />
      ))}
    </div>
  );
}

function WarningBlock({ data }) {
  const severityStyles = {
    caution: "bg-yellow-900/30 border-yellow-600/40 text-yellow-300",
    warning: "bg-amber-900/30 border-amber-600/40 text-amber-300",
    danger: "bg-red-900/30 border-red-600/40 text-red-300",
  };
  return (
    <div className={cn("flex items-start gap-2 p-3 rounded-lg border my-2", severityStyles[data.severity] || severityStyles.warning)}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="text-sm">{data.text}</div>
    </div>
  );
}

function NoteBlock({ data }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border bg-blue-900/20 border-blue-600/30 text-blue-300 my-2">
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="text-sm">{data.text}</div>
    </div>
  );
}

function LinkBlock({ data }) {
  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 my-1 transition-colors">
      <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-blue-400">{data.title || data.url}</span>
        {data.description && <p className="text-xs text-gray-500">{data.description}</p>}
      </div>
    </a>
  );
}

function PdfBlock({ data }) {
  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 my-1 transition-colors">
      <FileText className="w-4 h-4 text-red-400 shrink-0" />
      <span className="text-sm text-gray-300">{data.name || 'PDF Document'}</span>
    </a>
  );
}

function VideoBlock({ data }) {
  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 my-1 transition-colors">
      <Play className="w-4 h-4 text-purple-400 shrink-0" />
      <span className="text-sm text-gray-300">{data.title || 'Video'}</span>
    </a>
  );
}

function FileBlock({ data }) {
  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 my-1 transition-colors">
      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="text-sm text-gray-300">{data.name || 'File'}</span>
    </a>
  );
}

function StepBlock({ data }) {
  return (
    <div className="my-3 pl-4 border-l-2 border-red-600/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
          {data.step_number || '•'}
        </span>
        <span className="text-white font-medium text-sm">{data.title}</span>
      </div>
      {data.text && <p className="text-gray-300 text-sm ml-8 mb-1">{data.text}</p>}
      {data.image_url && (
        <img src={data.image_url} alt="" className="rounded-lg max-h-48 object-contain bg-gray-800 ml-8 my-1" />
      )}
      {data.warning && (
        <WarningBlock data={{ text: data.warning, severity: 'caution' }} />
      )}
      {data.note && (
        <NoteBlock data={{ text: data.note }} />
      )}
    </div>
  );
}

const BLOCK_RENDERERS = {
  text: TextBlock,
  heading: HeadingBlock,
  checklist: ChecklistBlock,
  image: ImageBlock,
  gallery: GalleryBlock,
  warning: WarningBlock,
  note: NoteBlock,
  link: LinkBlock,
  pdf: PdfBlock,
  video: VideoBlock,
  file: FileBlock,
  step: StepBlock,
};

export default function KnowledgeContentRenderer({ blocks }) {
  if (!blocks || blocks.length === 0) {
    return <p className="text-gray-500 text-sm italic">No content yet.</p>;
  }

  const sorted = [...blocks].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-1">
      {sorted.map((block) => {
        const Renderer = BLOCK_RENDERERS[block.type];
        if (!Renderer) return null;
        return <Renderer key={block.id} data={block.data || {}} />;
      })}
    </div>
  );
}