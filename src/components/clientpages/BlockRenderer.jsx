import React from "react";
import { ExternalLink, Download, FileText, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// --- Individual Block Components ---

function TextBlock({ data }) {
  if (!data?.content) return null;
  return (
    <div
      className="prose prose-invert prose-sm md:prose-base max-w-none
        prose-headings:text-white prose-p:text-gray-300 prose-a:text-red-400
        prose-strong:text-white prose-li:text-gray-300"
      dangerouslySetInnerHTML={{ __html: data.content }}
    />
  );
}

function MediaBlock({ data, resolvedAssets }) {
  const assets = resolvedAssets || [];
  if (!assets.length) return null;

  const layout = data?.layout || 'grid';

  if (layout === 'hero' && assets[0]) {
    const asset = assets[0];
    return (
      <div className="rounded-xl overflow-hidden">
        {asset.type === 'video' ? (
          <video src={asset.file_url} controls className="w-full rounded-xl" />
        ) : (
          <img src={asset.file_url} alt={asset.title || ''} className="w-full rounded-xl object-cover max-h-[500px]" />
        )}
        {asset.title && <p className="text-sm text-gray-400 mt-2 text-center">{asset.title}</p>}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${
      layout === 'carousel' ? 'grid-cols-1 md:grid-cols-2' :
      assets.length === 1 ? 'grid-cols-1' :
      assets.length === 2 ? 'grid-cols-2' :
      'grid-cols-2 md:grid-cols-3'
    }`}>
      {assets.map((asset, i) => (
        <div key={asset.id || i} className="rounded-lg overflow-hidden bg-gray-900 border border-gray-700">
          {asset.type === 'video' ? (
            <video src={asset.file_url} controls className="w-full" />
          ) : (
            <img src={asset.file_url} alt={asset.title || ''} className="w-full h-48 object-cover" />
          )}
          {asset.title && <p className="text-xs text-gray-400 p-2">{asset.title}</p>}
        </div>
      ))}
    </div>
  );
}

function LinksBlock({ data }) {
  const items = data?.items || [];
  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700 hover:border-red-500/50 hover:bg-gray-800/60 transition-all group"
        >
          <ExternalLink className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm group-hover:text-red-400 transition-colors">{item.title}</p>
            {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-red-400 shrink-0 mt-0.5" />
        </a>
      ))}
    </div>
  );
}

function FilesBlock({ data, resolvedAssets }) {
  const assets = resolvedAssets || [];
  if (!assets.length) return null;

  return (
    <div className="space-y-2">
      {assets.map((asset, i) => (
        <a
          key={asset.id || i}
          href={asset.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700 hover:border-gray-500 transition-all"
        >
          <FileText className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-sm text-white flex-1">{asset.title || 'Download file'}</span>
          {data?.allow_download !== false && (
            <Download className="w-4 h-4 text-gray-500" />
          )}
        </a>
      ))}
    </div>
  );
}

function CtaBlock({ data, onCtaClick }) {
  if (!data?.label) return null;

  const handleClick = () => {
    if (onCtaClick) onCtaClick();
    if (data.action_type === 'link' && data.value) {
      window.open(data.value, '_blank');
    } else if (data.action_type === 'email' && data.value) {
      window.location.href = `mailto:${data.value}`;
    } else if (data.action_type === 'phone' && data.value) {
      window.location.href = `tel:${data.value}`;
    }
  };

  return (
    <div className="text-center py-4">
      <Button
        onClick={handleClick}
        size="lg"
        className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-base font-semibold rounded-xl shadow-lg"
      >
        {data.label}
      </Button>
    </div>
  );
}

function MissingBlock() {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-600/30 text-amber-400 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>This content block is unavailable.</span>
    </div>
  );
}

// --- Main Renderer ---

const BLOCK_COMPONENTS = {
  text: TextBlock,
  media: MediaBlock,
  links: LinksBlock,
  files: FilesBlock,
  cta: CtaBlock,
};

export default function BlockRenderer({ block, onCtaClick }) {
  const data = block.resolved_data || block.data || null;

  if (!data || data._error) {
    return <div className="py-4"><MissingBlock /></div>;
  }

  const Component = BLOCK_COMPONENTS[block.type];
  if (!Component) return null;

  return (
    <div className="py-4">
      <Component
        data={data}
        resolvedAssets={block.resolved_assets}
        onCtaClick={onCtaClick}
      />
    </div>
  );
}