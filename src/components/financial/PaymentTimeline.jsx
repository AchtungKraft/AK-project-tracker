import React from "react";
import { 
  FileText, 
  DollarSign, 
  RotateCcw, 
  Send, 
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import PaymentConfidenceBadge, { derivePaymentConfidence } from "./PaymentConfidenceBadge";

/**
 * PaymentTimeline - Visual timeline of invoice/payment events
 */

const EVENT_CONFIG = {
  created: {
    icon: FileText,
    label: 'Invoice Created',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400',
  },
  sent: {
    icon: Send,
    label: 'Invoice Sent',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400',
  },
  exported: {
    icon: CheckCircle2,
    label: 'Exported to QB',
    color: 'text-green-400',
    bgColor: 'bg-green-400',
  },
  paid: {
    icon: DollarSign,
    label: 'Payment Received',
    color: 'text-green-400',
    bgColor: 'bg-green-400',
  },
  reversed: {
    icon: RotateCcw,
    label: 'Payment Reversed',
    color: 'text-red-400',
    bgColor: 'bg-red-400',
  },
  voided: {
    icon: AlertCircle,
    label: 'Invoice Voided',
    color: 'text-red-400',
    bgColor: 'bg-red-400',
  },
  pending: {
    icon: Clock,
    label: 'Awaiting Payment',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400',
  },
};

function TimelineEvent({ event, isLast, isActive }) {
  const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.pending;
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          isActive ? "bg-gray-700" : "bg-gray-800",
          isActive && "ring-2 ring-offset-2 ring-offset-gray-900 ring-gray-600"
        )}>
          <Icon className={cn("w-4 h-4", config.color)} />
        </div>
        {!isLast && (
          <div className="w-0.5 h-8 bg-gray-700 my-1" />
        )}
      </div>

      {/* Event content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between">
          <span className={cn("font-medium text-sm", config.color)}>
            {config.label}
          </span>
          {event.timestamp && (
            <span className="text-xs text-gray-500">
              {format(new Date(event.timestamp), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
        {event.details && (
          <p className="text-xs text-gray-400 mt-1">{event.details}</p>
        )}
        {event.user && (
          <p className="text-xs text-gray-500 mt-1">by {event.user}</p>
        )}
        {event.type === 'paid' && event.confidence && (
          <div className="mt-2">
            <PaymentConfidenceBadge status={event.confidence} compact />
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentTimeline({ batch, className }) {
  if (!batch) return null;

  // Build timeline events from batch data
  const events = [];

  // Created
  if (batch.created_date) {
    events.push({
      type: 'created',
      timestamp: batch.created_date,
      details: `Batch: ${batch.batch_name}`,
    });
  }

  // Exported
  if (batch.qb_exported_at) {
    events.push({
      type: 'exported',
      timestamp: batch.qb_exported_at,
      details: batch.qb_invoice_number ? `Invoice #${batch.qb_invoice_number}` : 'Exported to QuickBooks',
    });
  }

  // Sent
  if (batch.invoice_sent_at) {
    events.push({
      type: 'sent',
      timestamp: batch.invoice_sent_at,
    });
  }

  // Paid
  if (batch.payment_received_at && batch.status !== 'voided') {
    events.push({
      type: 'paid',
      timestamp: batch.payment_received_at,
      confidence: derivePaymentConfidence(batch),
    });
  }

  // Voided
  if (batch.voided_at) {
    events.push({
      type: 'voided',
      timestamp: batch.voided_at,
      user: batch.voided_by,
      details: batch.void_reason,
    });
  }

  // Reversed (if paid then status changed back)
  // This would be tracked via lifecycle events in a more complete implementation

  // Add pending state if not paid/voided
  if (batch.status !== 'paid' && batch.status !== 'voided' && events.length > 0) {
    events.push({
      type: 'pending',
      details: 'Awaiting client payment',
    });
  }

  // Sort by timestamp
  events.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });

  return (
    <div className={cn("bg-gray-800/50 rounded-lg p-4", className)}>
      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
        Payment Timeline
      </h4>
      <div>
        {events.map((event, index) => (
          <TimelineEvent
            key={`${event.type}-${index}`}
            event={event}
            isLast={index === events.length - 1}
            isActive={index === events.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// Compact version for inline display
export function PaymentTimelineCompact({ batch }) {
  if (!batch) return null;

  const steps = [
    { key: 'created', label: 'Created', done: !!batch.created_date },
    { key: 'exported', label: 'Exported', done: !!batch.qb_exported_at },
    { key: 'paid', label: 'Paid', done: batch.status === 'paid' },
  ];

  if (batch.status === 'voided') {
    return (
      <div className="flex items-center gap-2 text-red-400 text-xs">
        <AlertCircle className="w-3 h-3" />
        <span>Voided</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          <div className={cn(
            "w-2 h-2 rounded-full",
            step.done ? "bg-green-500" : "bg-gray-600"
          )} />
          {index < steps.length - 1 && (
            <div className={cn(
              "w-4 h-0.5",
              steps[index + 1].done ? "bg-green-500" : "bg-gray-600"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}