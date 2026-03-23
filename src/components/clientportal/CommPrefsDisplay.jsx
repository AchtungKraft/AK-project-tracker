import React from "react";
import { format } from "date-fns";
import { Mail, MessageSquare, Phone, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const ChannelRow = ({ icon: Icon, label, enabled, optInDate, needsPhone }) => {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        needsPhone ? "bg-yellow-500" :
        enabled ? "bg-green-500" : "bg-gray-600"
      )} />
      <Icon className={cn("w-3.5 h-3.5", enabled ? "text-gray-300" : "text-gray-600")} />
      <span className={cn("text-xs", enabled ? "text-gray-300" : "text-gray-500")}>
        {label}
      </span>
      {needsPhone && (
        <span className="text-xs text-yellow-500 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          No phone
        </span>
      )}
      {enabled && optInDate && (
        <span className="text-[10px] text-gray-500 ml-auto">
          Opted in {format(new Date(optInDate), 'MMM d, yyyy')}
        </span>
      )}
    </div>
  );
};

export default function CommPrefsDisplay({ client }) {
  if (!client) return null;

  const hasPhone = !!client.phone?.trim();
  const smsNeedsPhone = client.notify_sms && !hasPhone;
  const whatsappNeedsPhone = client.notify_whatsapp && !hasPhone;

  return (
    <div className="bg-gray-900/50 rounded-md p-2 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
        Communication Preferences
      </p>
      <ChannelRow
        icon={Mail}
        label="Email"
        enabled={client.notify_email !== false}
        optInDate={client.opt_in_email_date}
      />
      <ChannelRow
        icon={MessageSquare}
        label="SMS"
        enabled={client.notify_sms === true}
        optInDate={client.opt_in_sms_date}
        needsPhone={smsNeedsPhone}
      />
      <ChannelRow
        icon={Phone}
        label="WhatsApp"
        enabled={client.notify_whatsapp === true}
        optInDate={client.opt_in_whatsapp_date}
        needsPhone={whatsappNeedsPhone}
      />
    </div>
  );
}