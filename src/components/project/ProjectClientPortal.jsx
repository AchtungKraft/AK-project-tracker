import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import ClientPortalDashboard from "../clientportal/ClientPortalDashboard.jsx";
import CreateFeedbackRequestModal from "../clientportal/CreateFeedbackRequestModal.jsx";
import ManageClientAccessModal from "../clientportal/ManageClientAccessModal.jsx";

export default function ProjectClientPortal({ projectId }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleSelectRequest = (request) => {
    navigate(createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${projectId}`);
  };

  if (!user) return null;

  return (
    <>
      <ClientPortalDashboard
        projectId={projectId}
        onCreateRequest={() => setShowCreateModal(true)}
        onManageAccess={() => setShowAccessModal(true)}
        onSelectRequest={handleSelectRequest}
      />

      {showCreateModal && (
        <CreateFeedbackRequestModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          projectId={projectId}
          userId={user.id}
        />
      )}

      {showAccessModal && (
        <ManageClientAccessModal
          open={showAccessModal}
          onClose={() => setShowAccessModal(false)}
          projectId={projectId}
        />
      )}
    </>
  );
}