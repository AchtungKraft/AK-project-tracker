import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { referenceDataConfig } from "@/components/common/queryConfig";

/**
 * Parse a structured project number prefix from a project name.
 * Patterns: "24_9078_01 …", "24_9078 …", "21_9026_10 - …"
 * Returns { base, suffix, rest } or null if not a structured name.
 */
function parseProjectNumber(name) {
  if (!name) return null;
  // Match: YY_NNNN(_SS)? followed by optional separator + rest
  const m = name.match(/^(\d{2}_\d{4,5})(?:_(\d{2,3}))?(.*)$/);
  if (!m) return null;
  return {
    base: m[1],           // e.g. "24_9078"
    suffix: m[2] || null, // e.g. "01" or null
    rest: (m[3] || "").replace(/^[\s_//-]+/, "").trim(), // e.g. "Pravi 1976 RSR"
  };
}

/**
 * Find the next available suffix for a base project number.
 * Scans all existing projects, finds max suffix, returns max+1 zero-padded.
 */
function findNextSuffix(base, allProjects) {
  let maxSuffix = 0;
  for (const p of allProjects) {
    const parsed = parseProjectNumber(p.name);
    if (parsed && parsed.base === base) {
      const s = parsed.suffix ? parseInt(parsed.suffix, 10) : 0;
      if (s > maxSuffix) maxSuffix = s;
    }
  }
  const next = maxSuffix + 1;
  return String(next).padStart(2, "0");
}

/**
 * Build a suggested project name for a new project cloned from source.
 */
function buildSuggestedName(sourceProject, allProjects) {
  if (!sourceProject?.name) return "";
  const parsed = parseProjectNumber(sourceProject.name);
  if (!parsed) {
    // Freeform name — can't auto-number, return empty for manual entry
    return "";
  }
  const nextSuffix = findNextSuffix(parsed.base, allProjects);
  // Build: "24_9078_02" — just the number prefix, user fills in descriptive name
  return `${parsed.base}_${nextSuffix}`;
}

/**
 * Check if a project name already exists.
 */
function isDuplicateName(name, allProjects) {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return allProjects.some(p => p.name?.trim().toLowerCase() === lower);
}

export default function CreateProjectModal({ onClose, sourceProject = null }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Load all projects for duplicate checking + suffix calculation
  const { data: allProjects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  // Build initial state from sourceProject if provided
  const initialData = useMemo(() => {
    if (!sourceProject) {
      return {
        name: "", client_name: "", client_email: "", client_phone: "",
        vin: "", project_type_id: "", status_id: "",
        start_date: "", target_completion: "", assigned_team: [],
      };
    }
    return {
      name: buildSuggestedName(sourceProject, allProjects),
      client_name: sourceProject.client_name || "",
      client_email: sourceProject.client_email || "",
      client_phone: sourceProject.client_phone || "",
      vin: "",  // VIN is per-vehicle, never copied
      project_type_id: sourceProject.project_type_id || "",
      status_id: "",  // New project starts fresh
      start_date: "",
      target_completion: "",
      assigned_team: [],
    };
  }, [sourceProject, allProjects]);

  const [projectData, setProjectData] = useState(initialData);

  // Re-sync when allProjects loads after initial render (suffix calculation)
  useEffect(() => {
    if (sourceProject && allProjects.length > 0) {
      setProjectData(prev => {
        const suggested = buildSuggestedName(sourceProject, allProjects);
        // Only update if the user hasn't manually edited the name
        if (!prev.name || prev.name === buildSuggestedName(sourceProject, [])) {
          return { ...prev, name: suggested };
        }
        return prev;
      });
    }
  }, [sourceProject, allProjects]);

  // Duplicate check
  const duplicateWarning = useMemo(() => {
    if (!projectData.name?.trim()) return null;
    return isDuplicateName(projectData.name, allProjects) ? "A project with this name already exists." : null;
  }, [projectData.name, allProjects]);

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['referenceData', 'projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
    ...referenceDataConfig,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['referenceData', 'statuses'],
    queryFn: () => base44.entities.StatusList.list(),
    ...referenceDataConfig,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['referenceData', 'teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    ...referenceDataConfig,
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const activeTypes = projectTypes.filter(t => t.active);
  const activeTeamMembers = teamMembers.filter(tm => tm.active);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Re-validate duplicate at save time (handles concurrent creation)
      const freshProjects = await base44.entities.Project.list();
      if (isDuplicateName(data.name, freshProjects)) {
        // Find next available number
        const parsed = parseProjectNumber(data.name);
        if (parsed) {
          const nextSuffix = findNextSuffix(parsed.base, freshProjects);
          const newName = `${parsed.base}_${nextSuffix}`;
          toast({
            title: "Name was taken — updated",
            description: `"${data.name}" already exists. Using "${newName}" instead.`,
          });
          data = { ...data, name: newName };
        } else {
          throw new Error(`A project named "${data.name}" already exists. Please choose a different name.`);
        }
      }
      return base44.entities.Project.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: "Project created successfully" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (duplicateWarning) {
      toast({ title: "Duplicate name", description: duplicateWarning, variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...projectData,
      financial_model_version: 'forward'
    });
  };

  const toggleTeamMember = (memberId) => {
    const currentTeam = projectData.assigned_team || [];
    if (currentTeam.includes(memberId)) {
      setProjectData({
        ...projectData,
        assigned_team: currentTeam.filter(id => id !== memberId)
      });
    } else {
      setProjectData({
        ...projectData,
        assigned_team: [...currentTeam, memberId]
      });
    }
  };

  // Source project display info
  const sourceParsed = sourceProject ? parseProjectNumber(sourceProject.name) : null;

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          {sourceProject && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/30 border border-blue-800/40 text-sm">
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-gray-300">
                Source: <span className="text-white font-medium">{sourceProject.name}</span>
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Project Name</Label>
              <Input
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                placeholder={sourceProject && sourceParsed ? `e.g., ${sourceParsed.base}_XX Description` : "e.g., 1973 911 RSR Tribute"}
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
              {duplicateWarning && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {duplicateWarning}
                </p>
              )}
              {sourceProject && sourceParsed && !duplicateWarning && projectData.name && (
                <p className="text-xs text-gray-500 mt-1">
                  Base: {sourceParsed.base} · Next available suffix auto-calculated
                </p>
              )}
            </div>
            <div>
              <Label>VIN / Chassis Number</Label>
              <Input
                value={projectData.vin}
                onChange={(e) => setProjectData({ ...projectData, vin: e.target.value })}
                placeholder="VIN or chassis number"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Client Name</Label>
              <Input
                value={projectData.client_name}
                onChange={(e) => setProjectData({ ...projectData, client_name: e.target.value })}
                placeholder="Client name"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label>Client Email</Label>
              <Input
                type="email"
                value={projectData.client_email}
                onChange={(e) => setProjectData({ ...projectData, client_email: e.target.value })}
                placeholder="client@example.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label>Client Phone</Label>
              <Input
                value={projectData.client_phone}
                onChange={(e) => setProjectData({ ...projectData, client_phone: e.target.value })}
                placeholder="Phone number"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Project Type</Label>
              <Select
                value={projectData.project_type_id}
                onValueChange={(value) => setProjectData({ ...projectData, project_type_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={projectData.status_id}
                onValueChange={(value) => setProjectData({ ...projectData, status_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {projectStatuses.map(status => (
                    <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={projectData.start_date}
                onChange={(e) => setProjectData({ ...projectData, start_date: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label>Target Completion</Label>
              <Input
                type="date"
                value={projectData.target_completion}
                onChange={(e) => setProjectData({ ...projectData, target_completion: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label>Assigned Team Members</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {activeTeamMembers.map(member => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={(projectData.assigned_team || []).includes(member.id)}
                    onChange={() => toggleTeamMember(member.id)}
                    className="rounded"
                  />
                  <span className="text-sm text-white">{member.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          {!isMobile && (
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-red-600 hover:bg-red-700"
                disabled={createMutation.isPending || !!duplicateWarning}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </div>
          )}
        </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: createMutation.isPending ? 'Creating...' : 'Create Project',
        onClick: handleSubmit,
        disabled: createMutation.isPending || !!duplicateWarning,
        loading: createMutation.isPending,
      }}
      secondaryActions={[
        { label: 'Cancel', onClick: onClose, variant: 'outline' }
      ]}
    />
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Create New Project"
            onClose={onClose}
            footer={mobileFooter}
          >
            {formContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Project</DialogTitle>
          <DialogDescription>
            Enter the details to create a new project.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}