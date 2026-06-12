import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";

import MediaHeader from "@/components/media/MediaHeader";
import MediaBreadcrumbs from "@/components/media/MediaBreadcrumbs";
import MediaFolderView from "@/components/media/MediaFolderView";
import MediaGridView from "@/components/media/MediaGridView";
import MediaListView from "@/components/media/MediaListView";
import MediaViewer from "@/components/media/MediaViewer";
import MediaUploadModal from "@/components/media/MediaUploadModal";
import MediaReplaceModal from "@/components/media/MediaReplaceModal";
import MediaBulkActions from "@/components/media/MediaBulkActions";
import MediaMoveModal from "@/components/media/MediaMoveModal";
import MediaStorageAudit from "@/components/media/MediaStorageAudit";
import MigrationPreview from "@/components/media/MigrationPreview";
import {
  parseMediaUrl, extractFolders, getAssetsInFolder,
  sortAssets, searchAssets, filterByStatus
} from "@/components/media/mediaHelpers";

export default function MediaLibrary() {
  const queryClient = useQueryClient();

  // State
  const [viewMode, setViewMode] = useState('folder');
  const [currentPath, setCurrentPath] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [replaceAsset, setReplaceAsset] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modals
  const [showAudit, setShowAudit] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [migrationData, setMigrationData] = useState(null); // { oldAsset, newAsset, oldUrl, newUrl }

  // Data
  const { data: allAssets = [], isLoading } = useQuery({
    queryKey: ['mediaAssets'],
    queryFn: () => base44.entities.MediaAsset.list('-created_date', 500),
  });

  // Pipeline: status → search → sort
  const filteredAssets = useMemo(() => {
    let result = filterByStatus(allAssets, statusFilter);
    if (searchTerm) {
      result = searchAssets(result, searchTerm);
    }
    return sortAssets(result, sortBy);
  }, [allAssets, statusFilter, searchTerm, sortBy]);

  // Folder view data
  const folders = useMemo(() => extractFolders(filteredAssets, currentPath), [filteredAssets, currentPath]);
  const folderAssets = useMemo(() => getAssetsInFolder(filteredAssets, currentPath), [filteredAssets, currentPath]);

  // Multi-select
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
  }, [queryClient]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
    setIsRefreshing(false);
  }, [queryClient]);

  const handleGoToUrl = useCallback(async (url) => {
    const cleanUrl = url.trim();

    // Try to find existing asset by URL match
    const existingMatch = allAssets.find(a =>
      a.public_url === cleanUrl || a.file_url === cleanUrl ||
      a.full_relative_path === parseMediaUrl(cleanUrl)
    );

    if (existingMatch) {
      setCurrentPath(existingMatch.folder_path || '');
      setViewMode('folder');
      setSearchTerm('');
      setStatusFilter('all');
      setSelectedAsset(existingMatch);
      toast.success(`Found: ${existingMatch.file_name}`);
      return;
    }

    // No existing record — probe the URL to see if it loads
    toast.info('No existing record — probing URL...');

    const loaded = await new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + '_probe=' + Date.now();
      setTimeout(() => resolve(false), 8000);
    });

    if (!loaded) {
      toast.error('URL could not be loaded — image may not exist or is inaccessible');
      return;
    }

    // Image loads — auto-create MediaAsset record
    const fileName = cleanUrl.split('/').pop()?.split('?')[0] || 'unknown';
    const pathMatch = cleanUrl.match(/images\/public\/(.+?)(\?|$)/);
    const relativePath = pathMatch ? pathMatch[1] : fileName;
    const folderParts = relativePath.split('/');
    const folderPath = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : '';

    const newAsset = await base44.entities.MediaAsset.create({
      file_name: fileName,
      full_relative_path: relativePath,
      folder_path: folderPath,
      public_url: cleanUrl,
      file_url: cleanUrl,
      type: 'image',
      status: 'active',
      archived: false,
      version: 1,
      source_context: 'upload',
      notes: 'Auto-registered via Go To URL',
    });

    toast.success(`Image found & registered: ${fileName}`);
    invalidate();

    // Navigate to it
    setCurrentPath(folderPath);
    setViewMode('folder');
    setSearchTerm('');
    setStatusFilter('active');
    setSelectedAsset(newAsset);
  }, [allAssets, invalidate]);

  const handleArchive = useCallback(async (asset) => {
    const user = await base44.auth.me();
    await base44.entities.MediaAsset.update(asset.id, {
      archived: true,
      status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: user?.id,
    });
    toast.success(`${asset.file_name} archived`);
    setSelectedAsset(null);
    invalidate();
  }, [invalidate]);

  const handleUnarchive = useCallback(async (asset) => {
    await base44.entities.MediaAsset.update(asset.id, {
      archived: false,
      status: 'active',
    });
    toast.success(`${asset.file_name} restored`);
    setSelectedAsset(null);
    invalidate();
  }, [invalidate]);

  const handleReplace = useCallback((asset) => {
    setSelectedAsset(null);
    setReplaceAsset(asset);
  }, []);

  // Bulk operations
  const handleBulkArchive = useCallback(async () => {
    const user = await base44.auth.me();
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await base44.entities.MediaAsset.update(id, {
        archived: true,
        status: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: user?.id,
      });
    }
    toast.success(`${ids.length} asset(s) archived`);
    setSelectedIds(new Set());
    invalidate();
  }, [selectedIds, invalidate]);

  const handleBulkMove = useCallback(async (targetPath) => {
    setIsMoving(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const asset = allAssets.find(a => a.id === id);
      if (!asset) continue;
      const newRelativePath = targetPath ? `${targetPath}/${asset.file_name}` : asset.file_name;
      await base44.entities.MediaAsset.update(id, {
        folder_path: targetPath,
        full_relative_path: newRelativePath,
      });
    }
    toast.success(`${ids.length} asset(s) moved to ${targetPath || '/'}`);
    setSelectedIds(new Set());
    setShowMoveModal(false);
    setIsMoving(false);
    invalidate();
  }, [selectedIds, allAssets, invalidate]);

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <MediaHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          onUploadClick={() => setShowUpload(true)}
          onRefresh={handleRefresh}
          onGoToUrl={handleGoToUrl}
          onAuditClick={() => setShowAudit(true)}
          isRefreshing={isRefreshing}
          totalAssets={allAssets.length}
        />

        {/* Breadcrumbs */}
        {viewMode === 'folder' && (
          <MediaBreadcrumbs currentPath={currentPath} onNavigate={setCurrentPath} />
        )}

        {/* Content Views */}
        {viewMode === 'folder' && (
          <MediaFolderView
            folders={folders}
            assets={folderAssets}
            currentPath={currentPath}
            onNavigateFolder={setCurrentPath}
            onSelectAsset={setSelectedAsset}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        {viewMode === 'grid' && (
          <>
            <p className="text-xs text-gray-500">{filteredAssets.length} assets</p>
            {filteredAssets.length > 0 ? (
              <MediaGridView
                assets={filteredAssets}
                onSelectAsset={setSelectedAsset}
                onReplace={handleReplace}
                onArchive={handleArchive}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ) : (
              <EmptyState />
            )}
          </>
        )}

        {viewMode === 'list' && (
          <>
            <p className="text-xs text-gray-500">{filteredAssets.length} assets</p>
            {filteredAssets.length > 0 ? (
              <MediaListView
                assets={filteredAssets}
                onSelectAsset={setSelectedAsset}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ) : (
              <EmptyState />
            )}
          </>
        )}
      </div>

      {/* Bulk Actions Bar */}
      <MediaBulkActions
        selectedIds={selectedIds}
        allAssets={allAssets}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkArchive={handleBulkArchive}
        onBulkMove={() => setShowMoveModal(true)}
      />

      {/* Modals */}
      <MediaViewer
        asset={selectedAsset}
        open={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        onReplace={handleReplace}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
      />

      <MediaUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        currentPath={currentPath}
        existingAssets={allAssets}
        onSuccess={invalidate}
      />

      <MediaReplaceModal
        asset={replaceAsset}
        open={!!replaceAsset}
        onClose={() => setReplaceAsset(null)}
        onSuccess={() => { setReplaceAsset(null); invalidate(); }}
        onStartMigration={(data) => {
          setReplaceAsset(null);
          setMigrationData(data);
        }}
      />

      <MediaMoveModal
        open={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        assets={allAssets.filter(a => selectedIds.has(a.id))}
        allAssets={allAssets}
        onConfirm={handleBulkMove}
        isLoading={isMoving}
      />

      <MediaStorageAudit
        open={showAudit}
        onClose={() => setShowAudit(false)}
        allAssets={allAssets}
        onRefresh={invalidate}
      />

      <MigrationPreview
        open={!!migrationData}
        onClose={() => setMigrationData(null)}
        migrationData={migrationData}
        onComplete={() => { setMigrationData(null); invalidate(); }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-500">
      <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>No assets found</p>
    </div>
  );
}