import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, X, Edit2, Check, Calendar, FileText, ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
import { toast } from "sonner";
import ImageModal from "../ui/ImageModal";
import ProjectKanban from "./ProjectKanban";
import CompletedTasksSection from "./CompletedTasksSection";
import TaskViewSwitcher from "../tasks/TaskViewSwitcher";
import ProjectCalendarView from "./ProjectCalendarView";
import { useTaskData } from "../tasks/useTaskData";
import TaskDetailDrawer from "../tasks/TaskDetailDrawer";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

export default function ProjectOverview({ project, projectId, sharedData = {} }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [selectedImage, setSelectedImage] = useState(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  // Persist view mode per project
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem(`project_task_view_mode_${projectId}`) || 'card';
  });
  const [selectedTask, setSelectedTask] = useState(null);
  const [formData, setFormData] = useState({
    name: project?.name || "",
    client_name: project?.client_name || "",
    client_email: project?.client_email || "",
    client_phone: project?.client_phone || "",
    vin: project?.vin || "",
    start_date: project?.start_date || "",
    target_completion: project?.target_completion || "",
    project_type_id: project?.project_type_id || "",
    status_id: project?.status_id || ""
  });

  // Use shared data from parent to avoid redundant API calls
  const { 
    statuses = [], 
    projectTypes = [], 
    journalEntries = [],
    categories = [],
    teamMembers = [],
    tasks = [],
    projectBuckets = [],
  } = sharedData;

  // Use task data hook for all task operations - single source of truth
  const {
    tasks: taskDataTasks,
    commentCountByTaskId,
    handleToggleComplete,
    handleUpdateDueDate,
    handleUpdateStartDate,
    handleTogglePriority,
    handleConfirmRemovePriority,
    updateTask,
  } = useTaskData({ scope: 'project', projectId });
  
  // Use tasks from useTaskData as source of truth (not stale sharedData)
  const activeTasks = taskDataTasks;

  const currentStatus = statuses.find((s) => s.id === project?.status_id);
  const projectType = projectTypes.find((t) => t.id === project?.project_type_id);

  const recentEntries = journalEntries
    .sort((a, b) => new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date))
    .slice(0, 3);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      toast.success('Project updated successfully');
    }
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const imageUrls = results.map((r) => r.file_url);

      await updateMutation.mutateAsync({
        images: [...(project.images || []), ...imageUrls]
      });
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = (urlToRemove) => {
    updateMutation.mutate({
      images: (project.images || []).filter((url) => url !== urlToRemove)
    });
  };





  const handleSaveChanges = () => {
    updateMutation.mutate(formData);
  };

  const handleViewAllJournal = () => {
    const newUrl = `${window.location.pathname}?id=${projectId}&tab=journal`;
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };



  return (
    <>
      <div className={cn("space-y-4", isMobile && "space-y-3")}>
        {/* Project Info & Images - Collapsible */}
        <Collapsible open={infoExpanded} onOpenChange={setInfoExpanded}>
          <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="border-b border-red-900/30 p-4 cursor-pointer hover:bg-gray-900/30 transition-colors">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {infoExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <CardTitle className="text-white text-base">Project Information & Images</CardTitle>
                    {project?.images && project.images.length > 0 && (
                      <Badge className="bg-gray-700 text-gray-300 text-xs ml-2">
                        {project.images.length} images
                      </Badge>
                    )}
                  </div>
                  {infoExpanded && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        editing ? handleSaveChanges() : setEditing(true);
                      }}
                      disabled={updateMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 border-gray-700 gap-2"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : editing ? (
                        <>
                          <Check className="w-4 h-4" />
                          Save
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4 space-y-4">
                {/* Project Info */}
                {editing ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-gray-400 text-xs">Project Name</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Client Name</Label>
                      <Input
                        value={formData.client_name}
                        onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">VIN / Chassis</Label>
                      <Input
                        value={formData.vin}
                        onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Client Name</p>
                      <p className="text-white text-sm">{project?.client_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Client Email</p>
                      <p className="text-white text-sm">{project?.client_email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Client Phone</p>
                      <p className="text-white text-sm">{project?.client_phone || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">VIN / Chassis</p>
                      <p className="text-white font-mono text-sm">{project?.vin || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Type</p>
                      <p className="text-white text-sm">{projectType?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Status</p>
                      {currentStatus ? (
                        <Badge style={{ backgroundColor: currentStatus.color }} className="text-white text-xs">
                          {currentStatus.label}
                        </Badge>
                      ) : (
                        <p className="text-white text-sm">-</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Start Date</p>
                      <p className="text-white text-sm">
                        {project?.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Target Completion</p>
                      <p className="text-white text-sm">
                        {project?.target_completion ? format(new Date(project.target_completion), 'MMM d, yyyy') : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Progress</p>
                      <div className="flex items-center gap-2">
                        <Progress value={project?.progress_percent || 0} className="h-2 flex-1 bg-gray-800" />
                        <span className="text-xs text-gray-400">{project?.progress_percent || 0}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Shareable</p>
                      <p className="text-white text-sm">{project?.is_shareable ? 'Yes' : 'No'}</p>
                    </div>
                    {sharedData.teamMembers && project?.assigned_team?.length > 0 && (
                      <div className="md:col-span-2">
                        <p className="text-xs text-gray-400 mb-1">Assigned Team</p>
                        <div className="flex flex-wrap gap-1">
                          {project.assigned_team.map(memberId => {
                            const member = sharedData.teamMembers.find(tm => tm.id === memberId);
                            return member ? (
                              <Badge key={memberId} className="bg-gray-700 text-gray-200 text-xs">
                                {member.full_name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project Images */}
                {project?.images && project.images.length > 0 && (
                  <div className="pt-4 border-t border-gray-800">
                    <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Project Images</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {project.images.map((url, idx) => (
                        <div
                          key={idx}
                          className="w-full aspect-video bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                          onClick={() => setSelectedImage(url)}
                        >
                          <img
                            src={url}
                            alt={`Project ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* View Switcher - persist to localStorage per project */}
        <div className={cn("flex items-center justify-between", isMobile && "px-1")}>
          <TaskViewSwitcher 
            viewMode={viewMode} 
            onViewChange={(mode) => {
              setViewMode(mode);
              localStorage.setItem(`project_task_view_mode_${projectId}`, mode);
            }} 
          />
        </div>

        {/* Task Views */}
        {viewMode === 'card' ? (
          <>
            {/* Main Task Groups Board - pass inline control handlers */}
            <ProjectKanban 
              projectId={projectId} 
              sharedData={{
                ...sharedData,
                tasks: activeTasks,
                commentCountByTaskId,
                onUpdateDueDate: handleUpdateDueDate,
                onUpdateStartDate: handleUpdateStartDate,
                onTogglePriority: handleTogglePriority,
                showInlineControls: true,
              }} 
            />

            {/* Completed Tasks Section */}
            <CompletedTasksSection projectId={projectId} sharedData={{ ...sharedData, tasks: activeTasks }} />
          </>
        ) : (
          <ProjectCalendarView
            tasks={activeTasks}
            categories={categories}
            teamMembers={teamMembers}
            statuses={statuses}
            onTaskClick={setSelectedTask}
            onToggleComplete={handleToggleComplete}
            onUpdateDueDate={handleUpdateDueDate}
            onUpdateStartDate={handleUpdateStartDate}
            onTogglePriority={handleTogglePriority}
            commentCountByTaskId={commentCountByTaskId}
          />
        )}

        {/* Recent Journal Entries Grid */}
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Recent Journal Entries
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewAllJournal}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                View All →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {recentEntries.length === 0 ? (
              <p className="text-center text-gray-500 py-4 text-sm">No journal entries yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer border border-gray-800"
                    onClick={handleViewAllJournal}
                  >
                    <p className="text-white text-sm line-clamp-3 mb-2">{entry.content}</p>
                    {entry.photos && entry.photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        {entry.photos.slice(0, 3).map((url, idx) => (
                          <div
                            key={idx}
                            className="w-full h-16 bg-gray-800 rounded border border-gray-700 flex items-center justify-center overflow-hidden"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImage(url);
                            }}
                          >
                            <img
                              src={url}
                              alt={`Photo ${idx + 1}`}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.url && (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-red-400 hover:text-red-300 truncate block mb-2"
                      >
                        {entry.url}
                      </a>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(entry.entry_date || entry.created_date), 'MMM d, yyyy')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}