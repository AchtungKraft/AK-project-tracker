import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Bookmark, 
  ChevronDown, 
  Plus, 
  Pencil, 
  Trash2, 
  Check,
  X
} from "lucide-react";
import { toast } from "sonner";

export default function SavedViewsSelector({
  savedViews,
  activeViewName,
  onSelectView,
  onSaveView,
  onDeleteView,
  onRenameView,
  currentSelectedTypes,
  currentStatusFilter,
  className = ""
}) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [viewToRename, setViewToRename] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleSave = () => {
    if (!newViewName.trim()) {
      toast.error('Please enter a view name');
      return;
    }
    
    const success = onSaveView(newViewName, currentSelectedTypes, currentStatusFilter);
    if (success) {
      toast.success(`View "${newViewName}" saved`);
      setShowSaveDialog(false);
      setNewViewName('');
    } else {
      toast.error('Failed to save view');
    }
  };

  const handleRename = () => {
    if (!renameValue.trim()) {
      toast.error('Please enter a new name');
      return;
    }
    
    const success = onRenameView(viewToRename, renameValue);
    if (success) {
      toast.success(`View renamed to "${renameValue}"`);
      setShowRenameDialog(false);
      setViewToRename(null);
      setRenameValue('');
    } else {
      toast.error('Failed to rename view');
    }
  };

  const handleDelete = (viewName) => {
    const success = onDeleteView(viewName);
    if (success) {
      toast.success(`View "${viewName}" deleted`);
    }
  };

  const openRenameDialog = (viewName) => {
    setViewToRename(viewName);
    setRenameValue(viewName);
    setShowRenameDialog(true);
  };

  const activeView = savedViews.find(v => v.name === activeViewName);
  const hasFilters = currentSelectedTypes?.length > 0 || (currentStatusFilter && currentStatusFilter !== 'all');

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800 gap-2"
            >
              <Bookmark className="w-4 h-4 text-red-400" />
              <span className="max-w-32 truncate">{activeViewName}</span>
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {savedViews.map((view) => (
              <DropdownMenuItem
                key={view.name}
                className="flex items-center justify-between group cursor-pointer"
                onClick={() => onSelectView(view.name)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {activeViewName === view.name && (
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                  )}
                  <span className="truncate">{view.name}</span>
                  {view.selectedTypes?.length > 0 && (
                    <Badge variant="outline" className="text-xs px-1 py-0 shrink-0">
                      {view.selectedTypes.length} type{view.selectedTypes.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                {!view.isDefault && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameDialog(view.name);
                      }}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Pencil className="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(view.name);
                      }}
                      className="p-1 hover:bg-red-900/50 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowSaveDialog(true)}
              className="text-red-400 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" />
              Save Current Filters as View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Indicator if filters differ from saved view */}
        {activeView && !activeView.isDefault && hasFilters && (
          <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/50 bg-yellow-500/10">
            Modified
          </Badge>
        )}
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Save View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">View Name</label>
              <Input
                placeholder="e.g., Internal Projects, Client Builds..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div className="text-sm text-gray-500">
              <p>Current filters:</p>
              <ul className="mt-1 space-y-1">
                <li>• Types: {currentSelectedTypes?.length > 0 ? `${currentSelectedTypes.length} selected` : 'All'}</li>
                <li>• Status: {currentStatusFilter === 'all' ? 'All' : currentStatusFilter}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Rename View</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="New name..."
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="bg-gray-800 border-gray-700 text-white"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} className="bg-red-600 hover:bg-red-700">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}