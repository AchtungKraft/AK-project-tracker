import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilePlus2, Copy } from "lucide-react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import ProjectSourceSelector from "@/components/dashboard/ProjectSourceSelector";
import CreateProjectModal from "@/components/dashboard/CreateProjectModal";

export default function CreateProjectStartModal({ onClose }) {
  const isMobile = useIsMobile();
  // step: 'choose' | 'selectSource' | 'form'
  const [step, setStep] = useState("choose");
  const [sourceProject, setSourceProject] = useState(null);

  if (step === "form") {
    return <CreateProjectModal onClose={onClose} sourceProject={sourceProject} />;
  }

  if (step === "selectSource") {
    return (
      <ProjectSourceSelector
        onClose={onClose}
        onBack={() => setStep("choose")}
        onSelect={(project) => {
          setSourceProject(project);
          setStep("form");
        }}
      />
    );
  }

  const content = (
    <div className="space-y-4 py-2">
      <p className="text-sm text-gray-400">Choose how to start your new project.</p>

      <button
        type="button"
        onClick={() => {
          setSourceProject(null);
          setStep("form");
        }}
        className="w-full flex items-start gap-4 p-4 rounded-lg border border-gray-700 hover:border-red-500/50 hover:bg-red-950/20 transition-colors text-left"
      >
        <div className="mt-0.5 p-2 rounded-lg bg-gray-800">
          <FilePlus2 className="w-5 h-5 text-gray-300" />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">Blank Project</p>
          <p className="text-xs text-gray-400 mt-0.5">Start fresh with an empty project form.</p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setStep("selectSource")}
        className="w-full flex items-start gap-4 p-4 rounded-lg border border-gray-700 hover:border-blue-500/50 hover:bg-blue-950/20 transition-colors text-left"
      >
        <div className="mt-0.5 p-2 rounded-lg bg-gray-800">
          <Copy className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="font-semibold text-white text-sm">Create From Existing Project</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Copy client and contact information from an existing project. No tasks, files, or history are copied.
          </p>
        </div>
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper title="New Project" onClose={onClose}>
            {content}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">New Project</DialogTitle>
          <DialogDescription>Choose how to start</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}