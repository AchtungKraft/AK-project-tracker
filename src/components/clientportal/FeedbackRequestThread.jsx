import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, MessageSquare, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ImageReviewGallery from "./ImageReviewGallery.jsx";

export default function FeedbackRequestThread({ requestId, userId, onCreateTask }) {
  const { data: request } = useQuery({
    queryKey: ['clientFeedbackRequest', requestId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ id: requestId }),
    select: (data) => data[0],
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['clientFeedbackComments', requestId],
    queryFn: () => base44.entities.ClientFeedbackComment.filter({ request_id: requestId }),
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', requestId],
    queryFn: () => base44.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', requestId],
    queryFn: () => base44.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: clientContacts = [] } = useQuery({
    queryKey: ['clientContacts'],
    queryFn: () => base44.entities.ClientContact.list(),
  });

  const timeline = useMemo(() => {
    const events = [];

    // Posted event
    if (request?.posted_at) {
      events.push({
        type: 'system',
        timestamp: new Date(request.posted_at),
        message: 'Request posted to client',
      });
    }

    // Comments
    comments.forEach(comment => {
      const author = comment.author_type === 'internal_user'
        ? users.find(u => u.id === comment.author_id)
        : clientContacts.find(c => c.id === comment.author_id);

      const commentAttachments = attachments.filter(a => a.comment_id === comment.id);

      events.push({
        type: 'comment',
        timestamp: new Date(comment.created_date),
        comment,
        author,
        attachments: commentAttachments,
      });
    });

    // Decisions
    decisions.forEach(decision => {
      const decider = decision.decided_by_type === 'internal_user'
        ? users.find(u => u.id === decision.decided_by_id)
        : clientContacts.find(c => c.id === decision.decided_by_id);

      events.push({
        type: 'decision',
        timestamp: new Date(decision.decided_at || decision.created_date),
        decision,
        decider,
      });
    });

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [request, comments, decisions, attachments, users, clientContacts]);

  const requestImages = attachments.filter(a => a.attachment_type === 'image' && !a.comment_id);

  return (
    <div className="space-y-4">
      {request?.request_type === 'image_review' && requestImages.length > 0 && (
        <ImageReviewGallery
          images={requestImages}
          decisions={decisions}
          requestId={requestId}
          userId={userId}
          onCreateTask={onCreateTask}
        />
      )}

      <div className="space-y-3">
        {timeline.map((event, idx) => (
          <Card key={idx} className="bg-black/40 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4">
              {event.type === 'system' && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{event.message}</span>
                  <span className="ml-auto">{format(event.timestamp, 'MMM d, h:mm a')}</span>
                </div>
              )}

              {event.type === 'comment' && (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                        <span className="text-white font-bold text-xs">
                          {event.author?.name?.[0] || event.author?.full_name?.[0] || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">
                          {event.author?.name || event.author?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(event.timestamp, 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                    {event.comment.visibility === 'internal_only' && (
                      <Badge variant="outline" className="text-xs border-orange-500 text-orange-400">
                        Internal Only
                      </Badge>
                    )}
                  </div>

                  {event.comment.body && (
                    <p className="text-gray-300 whitespace-pre-wrap">{event.comment.body}</p>
                  )}

                  {event.attachments.length > 0 && (
                    <div className="space-y-2">
                      {event.attachments.filter(a => a.attachment_type === 'image').length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {event.attachments.filter(a => a.attachment_type === 'image').map(att => (
                            <img
                              key={att.id}
                              src={att.file_url}
                              alt=""
                              className="w-full h-32 object-cover rounded-lg border border-gray-700"
                            />
                          ))}
                        </div>
                      )}

                      {event.attachments.filter(a => a.attachment_type === 'link').map(att => (
                        <a
                          key={att.id}
                          href={att.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                        >
                          <LinkIcon className="w-4 h-4" />
                          {att.label || att.link_url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {event.type === 'decision' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {event.decision.decision === 'approved' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                    )}
                    <span className="font-medium text-white">
                      {event.decider?.name || event.decider?.full_name || 'Someone'} {event.decision.decision === 'approved' ? 'approved' : 'requested changes'}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {format(event.timestamp, 'MMM d, h:mm a')}
                    </span>
                  </div>

                  {event.decision.note && (
                    <p className="text-gray-300 text-sm ml-7">{event.decision.note}</p>
                  )}

                  {event.decision.decision === 'approved' && (
                    <Button
                      size="sm"
                      onClick={() => onCreateTask(event.decision)}
                      className="bg-green-600 hover:bg-green-700 ml-7"
                    >
                      Create Task from Approval
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}