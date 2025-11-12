import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CalendarIcon, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Helper to get full category path
const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

export default function CreateTaskModal({ onClose, projectId }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [taskData, setTaskData] = useState({
    name: "",
    description: "",
    project_id: projectId || "",
    category_id: "",
    assigned_team_member_id: "",
    status_id: "",
    start_date: "",
    due_date: "",
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    enabled: !projectId,
  });

  const { data: userTeamMember } = useQuery({
    queryKey: ['userTeamMember', user?.id],
    queryFn: () => base44.entities.TeamMember.filter({ user_id: user?.id }),
    select: (data) => data[0],
    enabled: !!user?.id,
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const activeCategories = categories.filter(c => c.active);
  const parentCategories = activeCategories.filter(c => !c.parent_id);
  const activeTeamMembers = teamMembers.filter(tm => tm.active);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      toast.success('Task created successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(taskData);
  };

  const handleAssignToMe = () => {
    if (userTeamMember) {
      setTaskData({ ...taskData, assigned_team_member_id: userTeamMember.id });
    } else {
      toast.error('Could not find your team member profile');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label className="text-gray-400">Task Name *</Label>
            <Input
              value={taskData.name}
              onChange={(e) => setTaskData({ ...taskData, name: e.target.value })}
              placeholder="Task name"
              className="bg-gray-800 border-gray-700 text-white"
              required
            />
          </div>

          <div>
            <Label className="text-gray-400">Description</Label>
            <Textarea
              value={taskData.description}
              onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
              placeholder="Task description"
              className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
            />
          </div>

          {!projectId && (
            <div>
              <Label className="text-gray-400">Project *</Label>
              <Select
                value={taskData.project_id}
                onValueChange={(value) => setTaskData({ ...taskData, project_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Category</Label>
              <Select
                value={taskData.category_id}
                onValueChange={(value) => setTaskData({ ...taskData, category_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {parentCategories.map(parent => {
                    const children = activeCategories.filter(c => c.parent_id === parent.id);
                    return (
                      <React.Fragment key={parent.id}>
                        <SelectItem value={parent.id}>
                          <span style={{ color: parent.color }}>{parent.name}</span>
                        </SelectItem>
                        {children.map(child => (
                          <SelectItem key={child.id} value={child.id}>
                            <span className="ml-4" style={{ color: child.color }}>
                              → {child.name}
                            </span>
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-400">Status</Label>
              <Select
                value={taskData.status_id}
                onValueChange={(value) => setTaskData({ ...taskData, status_id: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {taskStatuses.map(status => (
                    <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-gray-400">Assign To</Label>
              {userTeamMember && taskData.assigned_team_member_id !== userTeamMember.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAssignToMe}
                  className="border-gray-700 text-xs gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  Assign to Me
                </Button>
              )}
            </div>
            <Select
              value={taskData.assigned_team_member_id}
              onValueChange={(value) => setTaskData({ ...taskData, assigned_team_member_id: value })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Assign to team member" />
              </SelectTrigger>
              <SelectContent>
                {activeTeamMembers.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name} {member.team_role && `(${member.team_role})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskData.start_date ? format(new Date(taskData.start_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.start_date ? new Date(taskData.start_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-gray-400">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskData.due_date ? format(new Date(taskData.due_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.due_date ? new Date(taskData.due_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
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
                'Create Task'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}