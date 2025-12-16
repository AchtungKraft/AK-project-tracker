import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Link as LinkIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "../ui/ImageModal";

export default function ClientFeedbackThread({ requestId, clientContactId, isClientView }) {
  const [selectedImage, setSelectedImage] = useState(null);

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

    // Filter comments based on visibility
    const visibleComments = isClientView
      ? comments.filter(c => c.visibility === 'client_visible')
      : comments;

    visibleComments.forEach(comment => {
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
  }, [comments, decisions, attachments, users, clientContacts, isClientView]);

  return (
    <>
      <div className="space-y-3">
        {timeline.map((event, idx) => (
          <Card key={idx} className="bg-black/60 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4">
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
                    {!isClientView && event.comment.visibility === 'internal_only' && (
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
                            <div
                              key={att.id}
                              className="w-full h-32 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                              onClick={() => setSelectedImage(att.file_url)}
                            >
                              <img
                                src={att.file_url}
                                alt=""
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
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

                      {event.attachments.filter(a => a.attachment_type === 'file').map(att => (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          {att.label || att.file_url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {event.type === 'decision' && (
                <div className="flex items-center gap-2">
                  {event.decision.decision === 'approved' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                  )}
                  <div className="flex-1">
                    <span className="font-medium text-white text-sm">
                      {event.decider?.name || event.decider?.full_name || 'Someone'} {event.decision.decision === 'approved' ? 'approved' : 'requested changes'}
                    </span>
                    {event.decision.note && (
                      <p className="text-gray-300 text-sm mt-1">{event.decision.note}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(event.timestamp, 'MMM d, h:mm a')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}