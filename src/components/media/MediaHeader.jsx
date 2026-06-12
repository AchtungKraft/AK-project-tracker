import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Image, Upload, RefreshCw, Search, Link2, X, LayoutGrid, List, FolderOpen, ShieldCheck } from "lucide-react";

export default function MediaHeader({
  searchTerm, onSearchChange,
  viewMode, onViewModeChange,
  statusFilter, onStatusFilterChange,
  sortBy, onSortByChange,
  onUploadClick, onRefresh, onGoToUrl, onAuditClick,
  isRefreshing, totalAssets
}) {
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleGoToUrl = () => {
    if (urlInput.trim()) {
      onGoToUrl(urlInput.trim());
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-purple-600/20 rounded-lg border-2 border-purple-600">
            <Image className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white">MEDIA LIBRARY</h1>
            <p className="text-xs md:text-sm text-gray-400">
              {totalAssets} tracked assets • Use Audit to discover more
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onAuditClick}
            variant="outline"
            size="sm"
            className="border-gray-700 text-white gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Audit</span>
          </Button>
          <Button
            onClick={() => setShowUrlInput(!showUrlInput)}
            variant="outline"
            size="sm"
            className="border-gray-700 text-white gap-2"
          >
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Go To URL</span>
          </Button>
          <Button
            onClick={onUploadClick}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload
          </Button>
          <Button
            onClick={onRefresh}
            variant="outline"
            size="sm"
            className="border-gray-700 text-white"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* URL Input */}
      {showUrlInput && (
        <div className="flex gap-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
          <Input
            placeholder="Paste image URL... e.g. https://media.base44.com/images/public/..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGoToUrl()}
            className="bg-gray-900/50 border-gray-600 text-white flex-1"
          />
          <Button onClick={handleGoToUrl} size="sm" className="bg-purple-600 hover:bg-purple-700">
            Go
          </Button>
          <Button onClick={() => setShowUrlInput(false)} variant="ghost" size="icon" className="text-gray-400">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search files, folders, URLs..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white h-9 text-sm"
          />
          {searchTerm && (
            <button onClick={() => onSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Mode */}
        <div className="flex bg-gray-800/80 border border-gray-700 rounded-lg p-0.5">
          {[
            { mode: 'folder', icon: FolderOpen, label: 'Folders' },
            { mode: 'grid', icon: LayoutGrid, label: 'Grid' },
            { mode: 'list', icon: List, label: 'List' },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Status */}
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-28 bg-gray-900/50 border-gray-700 text-white h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={onSortByChange}>
          <SelectTrigger className="w-36 bg-gray-900/50 border-gray-700 text-white h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="filename">Filename</SelectItem>
            <SelectItem value="size">File Size</SelectItem>
            <SelectItem value="modified">Recently Modified</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}