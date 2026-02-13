import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2,
  CircleDot,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Package,
  Wrench,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";
import LifecycleProgressStack from "./LifecycleProgressStack";
import UniversalLifecycleBadge from "./UniversalLifecycleBadge";

/**
 * Drawer showing the lifecycle timeline for a commitment
 */

const EVENT_CONFIG = {
  COMMITMENT_CREATED: {
    icon: CircleDot,
    color: 'bg-gray-500',
    label: 'Created',
  },
  CLIENT_INVOICED: {
    icon: FileText,
    color: 'bg-yellow-500',
    label: 'Invoiced',
  },
  CLIENT_PAID: {
    icon: CreditCard,
    color: 'bg-green-500',
    label: 'Paid',
  },
  PO_CREATED: {
    icon: ShoppingCart,
    color: 'bg-blue-500',
    label: 'Ordered',
  },
  PART_RECEIVED: {
    icon: Package,
    color: 'bg-blue-400',
    label: 'Received',
  },
  PART_INSTALLED: {
    icon: Wrench,
    color: 'bg-purple-500',
    label: 'Installed',
  },
  STATUS_OVERRIDE: {
    icon: AlertTriangle,
    color: 'bg-orange-500',
    label: 'Override',
  },
  BILLING_STATUS_CHANGED: {
    icon: DollarSign,
    color: 'bg-yellow-400',
    label: 'Billing Changed',
  },
  PROCUREMENT_STATUS_CHANGED: {
    icon: ShoppingCart,
    color: 'bg-blue-400',
    label: 'Order Changed',
  },
  COMMITMENT_CANCELLED: {
    icon: AlertTriangle,
    color: 'bg-red-500',
    label: 'Cancelled',
  },
};

function TimelineEvent({ event, isLast }) {
  const config = EVENT_CONFIG[event.event_type] || {
    icon: CircleDot,
    color: 'bg-gray-500',
    label: event.event_type,
  };
  const Icon = config.icon;
  
  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-3 top-8 w-0.5 h-full bg-gray-700" />
      )}
      
      {/* Icon */}
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
        config.color
      )}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      
      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-center justify-between">
          <span className="font-medium text-white">{config.label}</span>
          <span className="text-xs text-gray-500">
            {moment(event.timestamp).format('MMM D, h:mm A')}
          </span>
        </div>
        
        {event.notes && (
          <p className="text-sm text-gray-400 mt-1">{event.notes}</p>
        )}
        
        {event.is_synthetic && (
          <Badge variant="outline" className="text-xs mt-1 text-gray-500 border-gray-600">
            Inferred
          </Badge>
        )}
        
        {event.new_state && !event.is_synthetic && (
          <div className="mt-2 p-2 bg-gray-800/50 rounded text-xs">
            <span className="text-gray-500">New state: </span>
            <span className="text-gray-300">
              {typeof event.new_state === 'string' ? event.new_state : JSON.stringify(event.new_state)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LifecycleTimelineDrawer({ 
  isOpen, 
  onClose, 
  commitmentId,
  commitmentData,
  lifecycleState,
}) {
  const { data: timelineData, isLoading } = useQuery({
    queryKey: ['lifecycleTimeline', commitmentId],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPartLifecycleTimeline', {
        commitment_id: commitmentId,
      });
      return response.data;
    },
    enabled: isOpen && !!commitmentId,
  });

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg bg-gray-900 border-gray-700">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Lifecycle Timeline
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Part Info Header */}
          {lifecycleState && (
            <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
              <div>
                <h3 className="font-medium text-white">{lifecycleState.part_name}</h3>
                <p className="text-sm text-gray-400">{lifecycleState.project_name}</p>
                {lifecycleState.part_type_missing && (
                  <Badge className="mt-1 bg-amber-600/30 text-amber-400 text-xs">
                    ⚠ Missing Part Type
                  </Badge>
                )}
              </div>
              
              <UniversalLifecycleBadge
                overallStage={lifecycleState.lifecycle_overall_stage}
                orderingSafety={lifecycleState.lifecycle_axes?.procurement?.ordering_safety}
                invoiceReadiness={lifecycleState.lifecycle_axes?.client?.invoice_readiness}
                showReadiness
              />
              
              <Separator className="bg-gray-700" />
              
              <LifecycleProgressStack
                clientBillingStatus={lifecycleState.lifecycle_axes?.client?.billing_status}
                clientPaymentStatus={lifecycleState.lifecycle_axes?.client?.payment_status}
                procurementStatus={lifecycleState.lifecycle_axes?.procurement?.procurement_status}
                installStatus={lifecycleState.lifecycle_axes?.installation?.install_status}
              />
              
              {/* Next Action */}
              {lifecycleState.recommended_action && lifecycleState.recommended_action !== 'Lifecycle Complete' && (
                <div className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                  <span className="text-xs text-gray-400">Next Action</span>
                  <Badge className={cn(
                    "text-xs",
                    lifecycleState.action_priority === 'HIGH' ? 'bg-red-600' :
                    lifecycleState.action_priority === 'MEDIUM' ? 'bg-yellow-600' : 'bg-gray-600'
                  )}>
                    {lifecycleState.recommended_action}
                  </Badge>
                </div>
              )}
            </div>
          )}
          
          {/* Timeline */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-4">Event History</h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
              </div>
            ) : timelineData?.timeline?.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-0">
                  {timelineData.timeline.map((event, index) => (
                    <TimelineEvent 
                      key={event.id} 
                      event={event} 
                      isLast={index === timelineData.timeline.length - 1}
                    />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No events recorded yet</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}