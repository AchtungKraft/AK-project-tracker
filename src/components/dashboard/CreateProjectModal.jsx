import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";

export default function CreateProjectModal({ onClose }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [projectData, setProjectData] = useState({
    name: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    vin: "",
    project_type_id: "",
    status_id: "",
    start_date: "",
    target_completion: "",
    assigned_team: [],
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const activeTypes = projectTypes.filter(t => t.active);
  const activeTeamMembers = teamMembers.filter(tm => tm.active);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create project');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(projectData);
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

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Project Name</Label>
              <Input
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                placeholder="e.g., 1973 911 RSR Tribute"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
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
                disabled={createMutation.isPending}
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
        disabled: createMutation.isPending,
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
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}