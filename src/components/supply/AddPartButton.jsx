import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AddPartToProjectModal from "@/components/project/AddPartToProjectModal";

/**
 * AddPartButton - Canonical entry point for adding parts to projects
 * 
 * Creates PartCommitment records via commitmentService
 * Single source of truth for "Add Part" action
 */
export default function AddPartButton({ projectId, onSuccess, disabled, variant = "default", size = "sm" }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)}
        disabled={disabled}
        variant={variant}
        size={size}
        className="gap-1"
      >
        <Plus className="w-4 h-4" />
        Add Part
      </Button>

      {showModal && (
        <AddPartToProjectModal
          projectId={projectId}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            onSuccess?.();
          }}
        />
      )}
    </>
  );
}