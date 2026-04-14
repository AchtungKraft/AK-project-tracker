import React, { useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { CREATE_TYPE_OPTIONS, REQUEST_TYPE_UI } from "./utils";

// Generate a unique submission token per attempt
function generateSubmissionToken() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Map backend error types to user-friendly messages
const ERROR_MESSAGES = {
  RATE_LIMIT: 'Temporary issue creating request. Please retry.',
  TIMEOUT: 'Request creation timed out. Please retry.',
  VALIDATION: null, // use backend message directly
  DUPLICATE: null,  // handled separately as safe success
  UNKNOWN: 'Failed to create feedback request. Please try again.',
};

const INITIAL_FORM = { title: '', body: '', request_type: 'update', due_date: '' };

export default function CreateFeedbackRequestModal({ open, onClose, projectId, userId }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(INITIAL_FORM);
  const submissionTokenRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM);
    submissionTokenRef.current = null;
    isSubmittingRef.current = false;
  }, []);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('createFeedbackRequest', data);
      return response.data; // axios response → extract .data
    },
    onSuccess: (result) => {
      isSubmittingRef.current = false;

      // Handle structured backend response
      if (result?.success === false) {
        const errorType = result?.error?.type || 'UNKNOWN';
        const errorMessage = result?.error?.message;

        // DUPLICATE is a safe success — request already exists
        if (errorType === 'DUPLICATE') {
          // Should not reach here since backend returns success:true for duplicates
          queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
          toast.info('Request already created.');
          onClose();
          resetForm();
          return;
        }

        const displayMessage = ERROR_MESSAGES[errorType] 
          || errorMessage 
          || ERROR_MESSAGES.UNKNOWN;
        toast.error(displayMessage);
        // Do NOT clear form on failure
        return;
      }

      // Backend returned success:true
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });

      if (result?.data?.id) {
        queryClient.invalidateQueries({ queryKey: ['feedbackDetail', result.data.id] });
      }

      if (result?.duplicate) {
        toast.info('Request already created; opening existing result.');
      } else {
        toast.success('Feedback request created');
      }

      if (result?.warnings?.length > 0) {
        console.warn('Create feedback request warnings:', result.warnings);
      }

      onClose();
      resetForm();
    },
    onError: (error) => {
      isSubmittingRef.current = false;

      // Try to extract structured error from axios error response
      const responseData = error?.response?.data;
      if (responseData?.error?.type) {
        const errorType = responseData.error.type;

        if (errorType === 'DUPLICATE') {
          queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
          toast.info('Request already created.');
          onClose();
          resetForm();
          return;
        }

        const displayMessage = ERROR_MESSAGES[errorType]
          || responseData.error.message
          || ERROR_MESSAGES.UNKNOWN;
        toast.error(displayMessage);
        return;
      }

      // Fallback for unstructured errors
      toast.error(ERROR_MESSAGES.UNKNOWN);
    },
  });

  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    // Strict submit guard: prevent double-click / repeated Enter
    if (isSubmittingRef.current || createMutation.isPending) return;
    isSubmittingRef.current = true;

    // Generate fresh submission token for this attempt
    submissionTokenRef.current = generateSubmissionToken();

    createMutation.mutate({
      ...formData,
      project_id: projectId,
      submission_token: submissionTokenRef.current,
    });
  }, [formData, projectId, createMutation]);

  // Prevent closing while submission is in flight
  const handleOpenChange = useCallback((isOpen) => {
    if (!isOpen && createMutation.isPending) return; // block close while submitting
    if (!isOpen) {
      isSubmittingRef.current = false;
    }
    onClose();
  }, [createMutation.isPending, onClose]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-gray-900 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Feedback Request</DialogTitle>
          <DialogDescription>
            Create a new request for client feedback or approval.
          </DialogDescription>
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
                {CREATE_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {REQUEST_TYPE_UI[type]?.label || type}
                  </SelectItem>
                ))}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
              className="border-gray-700"
            >
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