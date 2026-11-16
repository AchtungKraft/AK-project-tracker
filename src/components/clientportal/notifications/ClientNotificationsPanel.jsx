import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Bell, ChevronDown, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/lib/notify";
import RecipientPreview from "./RecipientPreview";
import NotificationLogRow from "./NotificationLogRow";

export default function ClientNotificationsPanel({ requestId }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["clientFeedbackNotifications", requestId],
    queryFn: async () => (await base44.functions.invoke("notifyClientFeedbackContacts", { action: "overview", requestId })).data,
    enabled: open && !!requestId,
  });
  const retry = useMutation({
    mutationFn: () => base44.functions.invoke("notifyClientFeedbackContacts", { action: "retry", requestId }),
    onSuccess: () => { toast.success("Retry finished"); refetch(); },
    onError: (e) => toast.error(e?.message || "Retry failed"),
  });
  const records = data?.records || [];
  const failed = records.filter((r) => r.status === "failed" && r.attempts < 5).length;

  return (
    <div className="rounded-lg border border-gray-700 bg-black/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Bell className="w-4 h-4 text-gray-400" />
        <span className="font-semibold">Client Notifications</span>
        {open && data && <span className="ml-auto text-xs text-gray-500">{records.length} deliveries</span>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : (
            <>
              <RecipientPreview recipients={data?.recipients || []} excluded={data?.excluded || []} isDraft={data?.is_draft} />
              <div className="space-y-1">
                {records.length === 0 && <p className="text-xs text-gray-500 italic">No client notifications sent yet.</p>}
                {records.map((r) => <NotificationLogRow key={r.id} record={r} />)}
              </div>
              {failed > 0 && (
                <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()} className="h-7 text-xs border-gray-600 text-gray-200">
                  {retry.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                  Retry {failed} failed
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}