import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Image as ImageIcon, Upload, X, Loader2, CalendarIcon, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ImageModal from "../ui/ImageModal";

export default function ToDoListDisplay({ 
  requestId, 
  tasks = [], 
  assignableUsers = [], 
  assignableContacts = [],
  token,
  slug,
  queryKey
}) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', details: '', assigned_to_id: '', assigned_to_type: '', due_date: null, images: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [editingTask, setEditingTask] = useState(null);

  // Combine users and contacts for dropdown - separate groups
  const achtungKraftAssignees = useMemo(() => {
    return assignableUsers.map(u => ({ id: u.id, name: u.full_name, type: 'internal_user' }));
  }, [assignableUsers]);

  const clientAssignees = useMemo(() => {
    return assignableContacts.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));
  }, [assignableContacts]);

  // Group and sort tasks
  const groupedTasks = useMemo(() => {
    const groups = {};
    
    tasks.forEach(task => {
      const assigneeName = task.assignee?.full_name || task.assignee?.name || 'Unassigned';
      if (!groups[assigneeName]) {
        groups[assigneeName] = [];
      }
      groups[assigneeName].push(task);
    });

    // Sort each group by due_date (closest first), then alphabetically
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        // Completed tasks go to bottom
        if (a.is_complete !== b.is_complete) return a.is_complete ? 1 : -1;
        // Sort by due date
        if (a.due_date && b.due_date) {
          return new Date(a.due_date) - new Date(b.due_date);
        }
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        // Then alphabetically
        return a.title.localeCompare(b.title);
      });
    });

    // Sort group names alphabetically, but "Unassigned" last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });

    return { groups, sortedKeys };
  }, [tasks]);

  const handleImageUpload = async (e, forEdit = false) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(file => base44.integrations.Core.UploadFile({ file }));
      const results = await Promise.all(uploadPromises);
      const urls = results.map(r => r.file_url);
      
      if (forEdit && editingTask) {
        setEditingTask({ ...editingTask, images: [...(editingTask.images || []), ...urls] });
      } else {
        setNewTask({ ...newTask, images: [...(newTask.images || []), ...urls] });
      }
      toast.success('Images uploaded');
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        requestId,
        action: 'create',
        task: {
          title: newTask.title,
          details: newTask.details || null,
          assigned_to_id: newTask.assigned_to_id || null,
          assigned_to_type: newTask.assigned_to_type || null,
          due_date: newTask.due_date || null,
          images: newTask.images?.length > 0 ? newTask.images : null
        }
      };
      if (token) payload.token = token;
      if (slug) payload.slug = slug;

      const response = await base44.functions.invoke('publicManageToDoTask', payload);
      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey });
        setNewTask({ title: '', details: '', assigned_to_id: '', assigned_to_type: '', due_date: null, images: [] });
        setShowAddForm(false);
        toast.success('Task added');
      } else {
        throw new Error(response.data?.error || 'Failed to add task');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async (task) => {
    try {
      const payload = {
        requestId,
        action: 'update',
        task: { id: task.id, is_complete: !task.is_complete }
      };
      if (token) payload.token = token;
      if (slug) payload.slug = slug;

      const response = await base44.functions.invoke('publicManageToDoTask', payload);
      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey });
      }
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask) return;

    setIsSubmitting(true);
    try {
      const payload = {
        requestId,
        action: 'update',
        task: {
          id: editingTask.id,
          title: editingTask.title,
          details: editingTask.details || null,
          assigned_to_id: editingTask.assigned_to_id || null,
          assigned_to_type: editingTask.assigned_to_type || null,
          due_date: editingTask.due_date || null,
          images: editingTask.images?.length > 0 ? editingTask.images : null
        }
      };
      if (token) payload.token = token;
      if (slug) payload.slug = slug;

      const response = await base44.functions.invoke('publicManageToDoTask', payload);
      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey });
        setEditingTask(null);
        toast.success('Task updated');
      } else {
        throw new Error(response.data?.error || 'Failed to update task');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;

    try {
      const payload = {
        requestId,
        action: 'delete',
        task: { id: taskId }
      };
      if (token) payload.token = token;
      if (slug) payload.slug = slug;

      const response = await base44.functions.invoke('publicManageToDoTask', payload);
      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey });
        toast.success('Task deleted');
      }
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const toggleExpand = (taskId) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleAssigneeChange = (value, forEdit = false) => {
    const [type, id] = value.split('::');
    if (forEdit && editingTask) {
      setEditingTask({ ...editingTask, assigned_to_id: id, assigned_to_type: type });
    } else {
      setNewTask({ ...newTask, assigned_to_id: id, assigned_to_type: type });
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Task Button */}
      <div className="flex justify-end">
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Task
        </Button>
      </div>

      {/* Task Groups */}
      {groupedTasks.sortedKeys.map(assigneeName => (
        <Card key={assigneeName} className="bg-black/60 backdrop-blur-xl border border-gray-700">
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-700 pb-2">
              {assigneeName}
            </h3>
            <div className="space-y-2">
              {groupedTasks.groups[assigneeName].map(task => {
                const isExpanded = expandedTasks.has(task.id);
                const taskImages = task.images || (task.image_url ? [task.image_url] : []);
                const hasImages = taskImages.length > 0;
                
                return (
                  <div 
                    key={task.id} 
                    className={cn(
                      "rounded-lg border transition-colors",
                      task.is_complete 
                        ? "bg-gray-800/30 border-gray-700/50" 
                        : "bg-gray-800/50 border-gray-600"
                    )}
                  >
                    <div 
                      className={cn(
                        "flex items-start gap-3 p-3",
                        hasImages && "cursor-pointer"
                      )}
                      onClick={() => hasImages && toggleExpand(task.id)}
                    >
                      <Checkbox
                        checked={task.is_complete}
                        onCheckedChange={() => handleToggleComplete(task)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-gray-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            "font-medium",
                            task.is_complete ? "text-gray-500 line-through" : "text-white"
                          )}>
                            {task.title}
                          </p>
                          {hasImages && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              {taskImages.length}
                            </span>
                          )}
                          {hasImages && (
                            isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                        {task.details && (
                          <p className={cn(
                            "text-sm mt-0.5",
                            task.is_complete ? "text-gray-600" : "text-gray-400"
                          )}>
                            {task.details}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {task.due_date && (
                            <p className={cn(
                              "text-xs",
                              new Date(task.due_date) < new Date() && !task.is_complete
                                ? "text-red-400"
                                : "text-gray-500"
                            )}>
                              Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
                            </p>
                          )}
                          {task.is_complete && task.completed_at && (
                            <p className="text-xs text-green-500">
                              ✓ Completed: {format(new Date(task.completed_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTask({ ...task, images: taskImages });
                        }}
                        className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                    
                    {isExpanded && hasImages && (
                      <div className="px-3 pb-3 border-t border-gray-700">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                          {taskImages.map((url, idx) => (
                            <div 
                              key={idx}
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGalleryImages(taskImages);
                                setGalleryIndex(idx);
                                setSelectedImage(url);
                              }}
                            >
                              <img 
                                src={url} 
                                alt="" 
                                className="w-full h-32 object-cover rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {tasks.length === 0 && (
        <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
          <CardContent className="p-8 text-center">
            <p className="text-gray-400">No tasks yet. Click "Add Task" to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* Add Task Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Task *</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Assigned To</label>
              <Select
                value={newTask.assigned_to_id ? `${newTask.assigned_to_type}::${newTask.assigned_to_id}` : ''}
                onValueChange={(v) => handleAssigneeChange(v)}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {achtungKraftAssignees.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-red-400 uppercase tracking-wide">Achtung Kraft</div>
                      {achtungKraftAssignees.map(a => (
                        <SelectItem key={`${a.type}::${a.id}`} value={`${a.type}::${a.id}`}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {clientAssignees.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-yellow-400 uppercase tracking-wide border-t border-gray-700 mt-1 pt-2">Project Clients</div>
                      {clientAssignees.map(a => (
                        <SelectItem key={`${a.type}::${a.id}`} value={`${a.type}::${a.id}`}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Details</label>
              <Textarea
                value={newTask.details}
                onChange={(e) => setNewTask({ ...newTask, details: e.target.value })}
                placeholder="Additional details..."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Due Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start border-gray-700 bg-gray-800 text-white">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newTask.due_date ? format(new Date(newTask.due_date), 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={newTask.due_date ? new Date(newTask.due_date) : undefined}
                    onSelect={(date) => setNewTask({ ...newTask, due_date: date?.toISOString() })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Images</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageUpload(e)}
                    className="hidden"
                    id="new-task-image"
                  />
                  <label htmlFor="new-task-image">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                      className="border-gray-700 cursor-pointer"
                      asChild
                    >
                      <span>
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                        Upload Images
                      </span>
                    </Button>
                  </label>
                  {newTask.images?.length > 0 && (
                    <span className="text-xs text-gray-400">{newTask.images.length} image(s)</span>
                  )}
                </div>
                {newTask.images?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {newTask.images.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt="" className="h-16 w-16 object-cover rounded" />
                        <button
                          onClick={() => setNewTask({ ...newTask, images: newTask.images.filter((_, i) => i !== idx) })}
                          className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddForm(false)} className="text-gray-400">Cancel</Button>
            <Button onClick={handleAddTask} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Task *</label>
                <Input
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Assigned To</label>
                <Select
                  value={editingTask.assigned_to_id ? `${editingTask.assigned_to_type}::${editingTask.assigned_to_id}` : 'unassigned'}
                  onValueChange={(v) => handleAssigneeChange(v, true)}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {achtungKraftAssignees.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-red-400 uppercase tracking-wide">Achtung Kraft</div>
                        {achtungKraftAssignees.map(a => (
                          <SelectItem key={`${a.type}::${a.id}`} value={`${a.type}::${a.id}`}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {clientAssignees.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-yellow-400 uppercase tracking-wide border-t border-gray-700 mt-1 pt-2">Project Clients</div>
                        {clientAssignees.map(a => (
                          <SelectItem key={`${a.type}::${a.id}`} value={`${a.type}::${a.id}`}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Details</label>
                <Textarea
                  value={editingTask.details || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, details: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Due Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start border-gray-700 bg-gray-800 text-white">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editingTask.due_date ? format(new Date(editingTask.due_date), 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editingTask.due_date ? new Date(editingTask.due_date) : undefined}
                      onSelect={(date) => setEditingTask({ ...editingTask, due_date: date?.toISOString() })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Images</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageUpload(e, true)}
                      className="hidden"
                      id="edit-task-image"
                    />
                    <label htmlFor="edit-task-image">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        className="border-gray-700 cursor-pointer"
                        asChild
                      >
                        <span>
                          {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                          Upload Images
                        </span>
                      </Button>
                    </label>
                    {editingTask.images?.length > 0 && (
                      <span className="text-xs text-gray-400">{editingTask.images.length} image(s)</span>
                    )}
                  </div>
                  {editingTask.images?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editingTask.images.map((url, idx) => (
                        <div key={idx} className="relative">
                          <img src={url} alt="" className="h-16 w-16 object-cover rounded" />
                          <button
                            onClick={() => setEditingTask({ ...editingTask, images: editingTask.images.filter((_, i) => i !== idx) })}
                            className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              onClick={() => {
                handleDeleteTask(editingTask.id);
                setEditingTask(null);
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditingTask(null)} className="text-gray-400">Cancel</Button>
              <Button onClick={handleUpdateTask} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Modal */}
      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => {
          setSelectedImage(null);
          setGalleryImages([]);
          setGalleryIndex(0);
        }}
        imageUrl={selectedImage}
        images={galleryImages}
        currentIndex={galleryIndex}
        onNavigate={(newIndex) => {
          setGalleryIndex(newIndex);
          setSelectedImage(galleryImages[newIndex]);
        }}
      />
    </div>
  );
}