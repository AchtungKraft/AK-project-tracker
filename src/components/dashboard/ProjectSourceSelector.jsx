import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowLeft, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { operationalDataConfig } from "@/components/common/queryConfig";

export default function ProjectSourceSelector({ onClose, onBack, onSelect }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date"),
    ...operationalDataConfig,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = projects.filter((p) => !p.is_system_project);
    if (!q) return list.slice(0, 20);
    return list.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.client_name?.toLowerCase().includes(q) ||
        p.vin?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const selectedProject = projects.find((p) => p.id === selectedId);

  const handleConfirm = () => {
    if (selectedProject) onSelect(selectedProject);
  };

  const listContent = (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search by name, client, or VIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-gray-800 border-gray-700 text-white"
          autoFocus
        />
      </div>

      <p className="text-xs text-gray-500">
        {search ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : "Recent projects"}
      </p>

      <div className="max-h-[45vh] overflow-y-auto space-y-1 -mx-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">No projects found</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                p.id === selectedId
                  ? "bg-blue-600/20 border border-blue-500/50"
                  : "hover:bg-gray-800 border border-transparent"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{p.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[p.client_name, p.vin].filter(Boolean).join(" · ") || "No client"}
                </p>
              </div>
              {p.id === selectedId && (
                <Check className="w-4 h-4 text-blue-400 shrink-0" />
              )}
            </button>
          ))
        )}
      </div>

      <div className="pt-2 border-t border-gray-700/50">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Copies client name, contact, email, phone, and project type into a new project. No tasks, files, comments, invoices, or history are copied.
        </p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Select Source Project"
            onClose={onClose}
            footer={
              <MobilePrimaryActionStack
                primaryAction={{
                  label: "Use This Project",
                  onClick: handleConfirm,
                  disabled: !selectedId,
                }}
                secondaryActions={[
                  { label: "Back", onClick: onBack, variant: "outline" },
                ]}
              />
            }
          >
            {listContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <DialogTitle className="text-lg font-bold">Select Source Project</DialogTitle>
              <DialogDescription>Choose a project to copy client information from.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {listContent}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!selectedId}
            onClick={handleConfirm}
          >
            Use This Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}