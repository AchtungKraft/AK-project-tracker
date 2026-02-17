import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyOnOrder Page - Redirects to SupplyQueues with on_order queue
 * Legacy page replaced by unified queue system
 */
export default function SupplyOnOrder() {
  const navigate = useNavigate();

  React.useEffect(() => {
    navigate(createPageUrl('SupplyQueues') + '?queue=on_order');
  }, [navigate]);

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-purple-400" />
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