
import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // New import
import { Calendar } from "@/components/ui/calendar"; // New import
import { Loader2, CalendarIcon } from "lucide-react"; // CalendarIcon added
import { toast } from "sonner";
import { format } from "date-fns"; // New import

export default function CreateTaskModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [taskData, setTaskData] = useState({
    name: "",
    description: "",
    project_id: projectId,
    category_id: "",
    assigned_team_member_id: "", // Changed from assigned_user_id
    status_id: "",
    start_date: "",
    due_date: "",
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: teamMembers = [] } = useQuery({ // Changed from users
    queryKey: ['teamMembers'], // Changed from users
    queryFn: () => base44.entities.TeamMember.list(), // Changed from User.list()
  });

  const taskStatuses = statuses.filter(s => s.scope === 'Task' && s.active);
  const activeCategories = categories.filter(c => c.active); // New filter
  const activeTeamMembers = teamMembers.filter(tm => tm.active); // New filter

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Frontend validation for task name, `required` attribute also helps
    if (!taskData.name) {
      toast.error('Task name is required');
      return;
    }
    createMutation.mutate(taskData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Task</DialogTitle> {/* Title changed */}
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4"> {/* mt-4 added */}
          <div>
            <Label>Task Name</Label> {/* htmlFor removed */}
            <Input
              value={taskData.name} // Changed from formData
              onChange={(e) => setTaskData({ ...taskData, name: e.target.value })} // Changed from formData
              placeholder="Task name" // Added placeholder
              className="bg-gray-800 border-gray-700 text-white" // ClassName updated
              required // Added required
            />
          </div>

          <div>
            <Label>Description</Label> {/* htmlFor removed */}
            <Textarea
              value={taskData.description} // Changed from formData
              onChange={(e) => setTaskData({ ...taskData, description: e.target.value })} // Changed from formData
              placeholder="Task description" // Added placeholder
              className="bg-gray-800 border-gray-700 text-white min-h-[100px]" // ClassName updated
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label> {/* htmlFor removed */}
              <Select
                value={taskData.category_id} // Changed from formData
                onValueChange={(value) => setTaskData({ ...taskData, category_id: value })} // Changed from formData
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"> {/* ClassName updated */}
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map(cat => ( // Using activeCategories
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label> {/* htmlFor removed */}
              <Select
                value={taskData.status_id} // Changed from formData
                onValueChange={(value) => setTaskData({ ...taskData, status_id: value })} // Changed from formData
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"> {/* ClassName updated */}
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {taskStatuses.map(status => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Assign To</Label> {/* Label text and htmlFor removed */}
            <Select
              value={taskData.assigned_team_member_id} // Changed from formData.assigned_user_id
              onValueChange={(value) => setTaskData({ ...taskData, assigned_team_member_id: value })} // Changed from formData.assigned_user_id
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Assign to team member" /> {/* Placeholder changed */}
              </SelectTrigger>
              <SelectContent>
                {activeTeamMembers.map(member => ( // Using activeTeamMembers
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name} {member.team_role && `(${member.team_role})`} {/* Added team_role */}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label> {/* htmlFor removed */}
              <Popover> {/* New component */}
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" /> {/* New icon */}
                    {taskData.start_date ? format(new Date(taskData.start_date), 'PPP') : 'Pick a date'} {/* Using format */}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.start_date ? new Date(taskData.start_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Due Date</Label> {/* htmlFor removed */}
              <Popover> {/* New component */}
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-700 text-white"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" /> {/* New icon */}
                    {taskData.due_date ? format(new Date(taskData.due_date), 'PPP') : 'Pick a date'} {/* Using format */}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={taskData.due_date ? new Date(taskData.due_date) : undefined}
                    onSelect={(date) => setTaskData({ ...taskData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={createMutation.isPending || !taskData.name} // Added taskData.name check for disabling
              className="bg-red-600 hover:bg-red-700"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
