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

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
    setIsRefreshing(false);
  }, [queryClient]);

  const handleGoToUrl = useCallback((url) => {
    const relativePath = parseMediaUrl(url);
    if (!relativePath) {
      toast.error('Could not parse URL');
      return;
    }

    // Find matching asset
    const match = allAssets.find(a =>
      a.full_relative_path === relativePath ||
      a.public_url === url ||
      a.file_url === url ||
      (a.file_name && relativePath.endsWith(a.file_name))
    );

    if (match) {
      // Navigate to folder and select
      setCurrentPath(match.folder_path || '');
      setViewMode('folder');
      setSearchTerm('');
      setSelectedAsset(match);
      toast.success(`Found: ${match.file_name}`);
    } else {
      // Try to search by partial match
      setSearchTerm(relativePath);
      setViewMode('grid');
      toast.info('Searching for matching assets...');
    }
  }, [allAssets]);

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
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
  }, [queryClient]);

  const handleUnarchive = useCallback(async (asset) => {
    await base44.entities.MediaAsset.update(asset.id, {
      archived: false,
      status: 'active',
    });
    toast.success(`${asset.file_name} restored`);
    setSelectedAsset(null);
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
  }, [queryClient]);

  const handleReplace = useCallback((asset) => {
    setSelectedAsset(null);
    setReplaceAsset(asset);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
  }, [queryClient]);

  const handleReplaceSuccess = useCallback(() => {
    setReplaceAsset(null);
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });
  }, [queryClient]);

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
          isRefreshing={isRefreshing}
          totalAssets={allAssets.length}
        />

        {/* Breadcrumbs — visible in folder mode */}
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
              <MediaListView assets={filteredAssets} onSelectAsset={setSelectedAsset} />
            ) : (
              <EmptyState />
            )}
          </>
        )}
      </div>

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
        onSuccess={handleUploadSuccess}
      />

      <MediaReplaceModal
        asset={replaceAsset}
        open={!!replaceAsset}
        onClose={() => setReplaceAsset(null)}
        onSuccess={handleReplaceSuccess}
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