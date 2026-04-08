import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, Trash2, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Photo {
  id: string;
  url: string;
  caption?: string;
  stage?: "before" | "during" | "after";
  uploadedAt?: string;
}

interface PhotoGalleryProps {
  photos?: Photo[];
  onAddPhoto?: (file: File, stage: "before" | "during" | "after", caption?: string) => void;
  onDeletePhoto?: (photoId: string) => void;
  readOnly?: boolean;
  maxPhotos?: number;
}

export default function PhotoGallery({
  photos = [],
  onAddPhoto,
  onDeletePhoto,
  readOnly = false,
  maxPhotos = 12
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<"before" | "during" | "after" | null>(null);
  const [caption, setCaption] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadStage && onAddPhoto) {
      onAddPhoto(file, uploadStage, caption);
      setCaption("");
      setUploadStage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const stageLabels = { before: "לפני", during: "בתהליך", after: "אחרי" };
  const stageColors = {
    before: "bg-blue-100 text-blue-700",
    during: "bg-yellow-100 text-yellow-700",
    after: "bg-green-100 text-green-700"
  };

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-foreground">תמונות עבודה ({photos.length}/{maxPhotos})</h3>
        {!readOnly && photos.length < maxPhotos && (
          <div className="flex gap-2">
            {(["before", "during", "after"] as const).map(stage => (
              <button
                key={stage}
                onClick={() => {
                  setUploadStage(stage);
                  fileInputRef.current?.click();
                }}
                className={`px-3 py-1 rounded text-sm font-medium ${stageColors[stage]} hover:opacity-80`}
              >
                <Plus size={14} className="inline mr-1" /> {stageLabels[stage]}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {photos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          אין תמונות עדיין. הוסף תמונות לפני, בתהליך, ואחרי העבודה.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="relative group cursor-pointer rounded-lg overflow-hidden bg-muted border border-border aspect-square"
              onClick={() => setSelectedIndex(idx)}
            >
              <img
                src={photo.url}
                alt={photo.caption || `Photo ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              {photo.stage && (
                <div className={`absolute top-1 right-1 px-2 py-0.5 rounded text-xs font-medium ${stageColors[photo.stage]} opacity-90`}>
                  {stageLabels[photo.stage]}
                </div>
              )}
              {!readOnly && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeletePhoto?.(photo.id);
                  }}
                  className="absolute top-1 left-1 p-1 bg-red-500/90 text-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedIndex(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative bg-black rounded-lg overflow-hidden max-w-4xl w-full aspect-video"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={photos[selectedIndex].url}
                alt="Lightbox"
                className="w-full h-full object-contain"
              />

              {photos[selectedIndex].caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-foreground p-3 text-sm">
                  {photos[selectedIndex].caption}
                </div>
              )}

              <button
                onClick={() => setSelectedIndex(null)}
                className="absolute top-2 right-2 p-2 bg-black/60 text-foreground rounded hover:bg-black/80"
              >
                <X size={20} />
              </button>

              {selectedIndex > 0 && (
                <button
                  onClick={() => setSelectedIndex(selectedIndex - 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-foreground rounded hover:bg-black/80"
                >
                  <ChevronLeft size={20} />
                </button>
              )}

              {selectedIndex < photos.length - 1 && (
                <button
                  onClick={() => setSelectedIndex(selectedIndex + 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-foreground rounded hover:bg-black/80"
                >
                  <ChevronRight size={20} />
                </button>
              )}

              <a
                href={photos[selectedIndex].url}
                download
                className="absolute top-2 left-2 p-2 bg-black/60 text-foreground rounded hover:bg-black/80"
              >
                <Download size={20} />
              </a>

              <div className="absolute bottom-2 left-2 text-foreground text-sm bg-black/60 px-2 py-1 rounded">
                {selectedIndex + 1} / {photos.length}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
