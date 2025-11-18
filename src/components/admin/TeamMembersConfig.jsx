import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function TeamMembersConfig() {
  const queryClient = useQueryClient();
  const [newMember, setNewMember] = useState({
    full_name: "",
    team_role: "",
    email: "",
    phone: "",
    company: "",
    is_achtung_kraft_member: false,
    sort_order: 0,
  });
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const members = await base44.entities.TeamMember.list();
      return members.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TeamMember.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
      setNewMember({ full_name: "", team_role: "", email: "", phone: "", company: "", is_achtung_kraft_member: false, sort_order: 0 });
      toast.success('Team member added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TeamMember.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
      setEditing(null);
      toast.success('Team member updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TeamMember.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
      toast.success('Team member deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newMember.full_name.trim()) return;
    createMutation.mutate({
      ...newMember,
      active: true,
    });
  };

  const startEdit = (member) => {
    setEditing(member.id);
    setEditData(member);
  };

  const handleSave = () => {
    updateMutation.mutate({
      id: editing,
      data: editData,
    });
  };

  const handleToggleActive = (id, member) => {
    updateMutation.mutate({
      id,
      data: { active: !member.active },
    });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this team member? This may affect existing assignments.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const reordered = Array.from(teamMembers);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    // Update sort_order for all items
    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    // Optimistically update UI
    queryClient.setQueryData(['teamMembers'], reordered.map((item, index) => ({
      ...item,
      sort_order: index
    })));

    // Send updates to server
    try {
      await Promise.all(updates.map(u => base44.entities.TeamMember.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['teamMembers'] });
      toast.error('Failed to update order');
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <CardTitle className="text-white">Team Members</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage assignable team members for projects and tasks
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Add New Member Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Full Name</Label>
              <Input
                value={newMember.full_name}
                onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })}
                placeholder="John Doe"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
            </div>
            <div>
              <Label className="text-gray-400">Role / Specialty</Label>
              <Input
                value={newMember.team_role}
                onChange={(e) => setNewMember({ ...newMember, team_role: e.target.value })}
                placeholder="e.g., Fabricator, Engineer"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Email</Label>
              <Input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                placeholder="john@example.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Phone</Label>
              <Input
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                placeholder="Phone number"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400">Company</Label>
              <Input
                value={newMember.company}
                onChange={(e) => setNewMember({ ...newMember, company: e.target.value })}
                placeholder="Company name"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="new-achtung-kraft"
                checked={newMember.is_achtung_kraft_member}
                onCheckedChange={(checked) => 
                  setNewMember({ ...newMember, is_achtung_kraft_member: checked })
                }
              />
              <Label htmlFor="new-achtung-kraft" className="text-gray-400 cursor-pointer">
                Achtung Kraft Member (Full Access)
              </Label>
            </div>
          </div>
          <Button 
            type="submit" 
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !newMember.full_name.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Team Member
              </>
            )}
          </Button>
        </form>

        {/* Team Members List with Drag and Drop */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : teamMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No team members yet. Add one above.
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="team-members">
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {teamMembers.map((member, index) => (
                    <Draggable key={member.id} draggableId={member.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
                            snapshot.isDragging ? 'shadow-lg border border-red-900/50' : ''
                          }`}
                        >
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <GripVertical className="w-5 h-5 text-gray-500" />
                          </div>
                          
                          {editing === member.id ? (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 flex-1">
                                <Input
                                  value={editData.full_name}
                                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                                  className="bg-gray-800 border-gray-700 text-white"
                                />
                                <Input
                                  value={editData.team_role}
                                  onChange={(e) => setEditData({ ...editData, team_role: e.target.value })}
                                  className="bg-gray-800 border-gray-700 text-white"
                                  placeholder="Role"
                                />
                                <Input
                                  value={editData.email}
                                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                  className="bg-gray-800 border-gray-700 text-white"
                                  placeholder="Email"
                                />
                                <Input
                                  value={editData.phone}
                                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                                  className="bg-gray-800 border-gray-700 text-white"
                                  placeholder="Phone"
                                />
                                <Input
                                  value={editData.company || ""}
                                  onChange={(e) => setEditData({ ...editData, company: e.target.value })}
                                  className="bg-gray-800 border-gray-700 text-white"
                                  placeholder="Company"
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`edit-ak-${member.id}`}
                                  checked={editData.is_achtung_kraft_member || false}
                                  onCheckedChange={(checked) => 
                                    setEditData({ ...editData, is_achtung_kraft_member: checked })
                                  }
                                />
                                <Label htmlFor={`edit-ak-${member.id}`} className="text-gray-400 text-xs cursor-pointer">
                                  AK
                                </Label>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleSave}
                                className="text-green-400"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditing(null)}
                                className="text-red-400"
                              >
                                <XIcon className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className={`font-medium ${member.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                                    {member.full_name}
                                  </h3>
                                  {member.team_role && (
                                    <span className="text-sm text-gray-400">({member.team_role})</span>
                                  )}
                                  {member.is_achtung_kraft_member && (
                                    <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 border border-red-500 rounded">
                                      AK Full Access
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-3 text-sm text-gray-500 mt-1">
                                  {member.email && <span>{member.email}</span>}
                                  {member.phone && <span>{member.phone}</span>}
                                  {member.company && <span>🏢 {member.company}</span>}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleActive(member.id, member)}
                                className={member.active ? 'text-green-400' : 'text-gray-500'}
                              >
                                {member.active ? 'Active' : 'Inactive'}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => startEdit(member)}
                                className="text-blue-400"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(member.id)}
                                className="text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </CardContent>
    </Card>
  );
}