import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, Paperclip, Link2 } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "@/components/ui/ImageModal";

export default function ClientJournal({ projectId, token, slug }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['clientJournalEntries', projectId, token, slug],
    queryFn: async () => {
      const response = await base44.functions.invoke('getClientJournalEntries', { 
        projectId, 
        token: token || undefined,
        slug: slug || undefined
      });
      return response.data?.entries || [];
    },
    enabled: !!projectId && !!(token || slug),
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

                  <div className="prose prose-invert max-w-none mb-6">
                    <p className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  
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

                  {entry.url && (
                    <a
                      href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 mb-3 px-3 py-2 bg-gray-800/50 rounded-lg"
                    >
                      <Link2 className="w-4 h-4" />
                      {entry.url}
                    </a>
                  )}

                  {entry.attachments?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-800">
                      {entry.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <Paperclip className="w-4 h-4" />
                          {att.name}
                        </a>
                      ))}
                    </div>
                  )}
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