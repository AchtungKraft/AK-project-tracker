import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wrench } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyInstalled Page - Redirects to SupplyQueues with ready_to_install queue
 * Legacy page replaced by unified queue system
 */
export default function SupplyInstalled() {
  const navigate = useNavigate();

  React.useEffect(() => {
    navigate(createPageUrl('SupplyQueues') + '?queue=ready_to_install');
  }, [navigate]);

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <div className="text-center">
          <Wrench className="w-12 h-12 mx-auto mb-4 text-green-400" />
          <p className="text-white mb-4">Redirecting to Supply Queues...</p>
          <Button onClick={() => navigate(createPageUrl('SupplyQueues'))}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Supply Queues
          </Button>
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}