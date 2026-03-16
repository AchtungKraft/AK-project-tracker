import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, Paperclip } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "@/components/ui/ImageModal";
import { JournalBodyRenderer, JournalLinksRenderer, JournalAttachmentsRenderer, JournalProseStyles } from "@/components/journal/JournalContentRenderer";

export default function ClientJournal({ projectId, token, slug }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['clientJournalEntries', projectId, token, slug],
    queryFn: async () => {
      const payload = { projectId };
      if (token && token !== 'null' && token.trim()) {
        payload.token = token;
      }
      if (slug && slug !== 'null' && slug.trim()) {
        payload.slug = slug;
      }
      const response = await base44.functions.invoke('getClientJournalEntries', payload);
      return response.data?.entries || [];
    },
    enabled: !!projectId && !!((token && token !== 'null') || (slug && slug !== 'null')),
  });

  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
  );

  if (error) {
    return (
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
        <CardContent className="p-8 text-center">
          <p className="text-red-400">Failed to load journal entries.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <JournalProseStyles />
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
        <CardHeader className="border-b border-gray-700">
          <CardTitle className="text-white">Project Journal</CardTitle>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading journal entries...</div>
          ) : sortedEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No journal entries available.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedEntries.map(entry => (
                <article
                  key={entry.id}
                  className="p-6 bg-gray-900/50 rounded-xl border border-gray-800"
                >
                  <div className="flex items-center justify-between gap-3 text-sm text-gray-400 mb-4 pb-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(entry.entry_date || entry.created_date), 'MMMM d, yyyy')}</span>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                      <Eye className="w-3 h-3 mr-1" /> Client Visible
                    </Badge>
                  </div>

                  {entry.headline && (
                    <h2 className="text-2xl font-bold text-white mb-4">{entry.headline}</h2>
                  )}

                  {/* Rich content or legacy plain text */}
                  <div className="mb-6">
                    <JournalBodyRenderer entry={entry} />
                  </div>
                  
                  {/* Gallery photos */}
                  {entry.photos?.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {entry.photos.map((url, idx) => (
                        <div 
                          key={idx}
                          className="relative aspect-video bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-red-500 transition-colors group cursor-pointer"
                          onClick={() => {
                            setGalleryImages(entry.photos);
                            setGalleryIndex(idx);
                            setSelectedImage(url);
                          }}
                        >
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Structured Links (normalizer handles legacy url→links) */}
                  <div className="mb-4">
                    <JournalLinksRenderer entry={entry} />
                  </div>

                  {/* Attachments */}
                  <JournalAttachmentsRenderer entry={entry} />
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => {
          setSelectedImage(null);
          setGalleryImages([]);
          setGalleryIndex(0);
        }}
        imageUrl={selectedImage}
        images={galleryImages}
        currentIndex={galleryIndex}
        onNavigate={(newIndex) => {
          setGalleryIndex(newIndex);
          setSelectedImage(galleryImages[newIndex]);
        }}
      />
    </>
  );
}