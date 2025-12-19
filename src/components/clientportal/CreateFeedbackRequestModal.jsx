import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function CreateFeedbackRequestModal({ open, onClose, projectId, userId }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    request_type: 'question',
    due_date: '',
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('createFeedbackRequest', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
      toast.success('Feedback request created');
      onClose();
      setFormData({ title: '', body: '', request_type: 'question', due_date: '' });
    },
    onError: () => {
      toast.error('Failed to create feedback request');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      project_id: projectId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Feedback Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Request title"
              className="bg-gray-800 border-gray-700 text-white"
              required
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={formData.request_type} onValueChange={(value) => setFormData({ ...formData, request_type: value })}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="image_review">Design Review</SelectItem>
                <SelectItem value="approval">Need from Client</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Describe what you need from the client..."
              className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
            />
          </div>

          <div>
            <Label>Due Date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start bg-gray-800 border-gray-700 text-white">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.due_date ? format(new Date(formData.due_date), 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.due_date ? new Date(formData.due_date) : undefined}
                  onSelect={(date) => setFormData({ ...formData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Draft'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}