import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import AddPartToProjectModal from "@/components/project/AddPartToProjectModal";
import { useWiringAudit } from "@/components/dev/wiringAudit";

/**
 * AddPartButton - Canonical entry point for adding parts to projects
 * 
 * Creates PartCommitment records via commitmentService
 * Single source of truth for "Add Part" action
 * 
 * WIRING AUDIT: All clicks and outcomes logged for debugging
 */
export default function AddPartButton({ projectId, onSuccess, disabled, variant = "default", size = "sm" }) {
  const [showModal, setShowModal] = useState(false);
  const audit = useWiringAudit('AddPartButton');

  const handleClick = () => {
    audit.trackClick('add_part_button', { projectId });
    if (!projectId) {
      toast.error('No project selected');
      audit.trackError('add_part_button', new Error('No projectId'));
      return;
    }
    setShowModal(true);
  };

  const handleSuccess = () => {
    audit.trackSuccess('add_part_modal_submit', { projectId });
    toast.success('Part added to project');
    setShowModal(false);
    onSuccess?.();
  };

  const handleError = (error) => {
    audit.trackError('add_part_modal_submit', error);
    toast.error('Failed to add part: ' + (error?.message || 'Unknown error'));
  };

  const handleClose = () => {
    setShowModal(false);
  };

  return (
    <>
      <Button 
        onClick={handleClick}
        disabled={disabled || !projectId}
        variant={variant}
        size={size}
        className="gap-1 bg-red-600 hover:bg-red-700"
      >
        <Plus className="w-4 h-4" />
        Add Part
      </Button>

      {showModal && (
        <AddPartToProjectModal
          projectId={projectId}
          onClose={handleClose}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}
    </>
  );
}