'use client';

import { X, Download, ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { FileData, formatFileSize, formatDate, api } from '@/lib/api';
import toast from 'react-hot-toast';

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function fitZoomStep(imgWidth: number, imgHeight: number, containerWidth: number, containerHeight: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    const step = ZOOM_STEPS[i];
    if (imgWidth * step <= containerWidth && imgHeight * step <= containerHeight) {
      return step;
    }
  }
  return ZOOM_STEPS[0];
}

interface FilePreviewProps {
  file: FileData;
  files: FileData[];
  onClose: () => void;
  onNavigate: (file: FileData) => void;
  onDeleted?: () => void;
}

export function FilePreview({ file, files, onClose, onNavigate, onDeleted }: FilePreviewProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Move "${file.original_name}" to trash?`)) return;
    setIsDeleting(true);
    try {
      await api.deleteFile(file.id);
      toast.success('Moved to trash');
      onDeleted?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const [zoom, setZoom] = useState(1);
  const [initialZoom, setInitialZoom] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isImage = file.file_type === 'image';

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const container = containerRef.current;
    if (!container) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    const padding = 8;
    const cw = container.clientWidth - padding;
    const ch = container.clientHeight - padding;
    const fit = fitZoomStep(img.naturalWidth, img.naturalHeight, cw, ch);
    setZoom(fit);
    setInitialZoom(fit < 1 ? fit : null);
  }, []);

  const handleZoomIn = () => {
    setZoom((z) => {
      const next = ZOOM_STEPS.find((s) => s > z);
      return next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    });
  };
  const handleZoomOut = () => {
    setZoom((z) => {
      const prev = [...ZOOM_STEPS].reverse().find((s) => s < z);
      return prev ?? ZOOM_STEPS[0];
    });
  };

  const currentIndex = files.findIndex((f) => f.id === file.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      setNaturalSize(null);
      setInitialZoom(null);
      onNavigate(files[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, files, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      setNaturalSize(null);
      setInitialZoom(null);
      onNavigate(files[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, files, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[96vw] max-h-[96vh] m-2 flex flex-col bg-dark-800
                   rounded-xl border border-dark-600 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-dark-600">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium text-white truncate max-w-md">
              {file.original_name}
            </h3>
            <span className={`px-2 py-1 rounded text-xs font-mono uppercase
              ${file.file_type === 'image'
                ? 'bg-neon-cyan/20 text-neon-cyan'
                : 'bg-neon-purple/20 text-neon-purple'}`}>
              {file.file_type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <button
                  onClick={handleZoomOut}
                  className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4 text-gray-400" />
                </button>
                <span className={`font-mono text-sm min-w-[60px] text-center ${
                  initialZoom !== null && zoom < 1 ? 'text-amber-400' : 'text-gray-400'
                }`}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4 text-gray-400" />
                </button>
              </>
            )}
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
            <a
              href={file.url}
              download={file.original_name}
              className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </a>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                         transition-colors disabled:opacity-50"
              title="Move to trash"
            >
              <Trash2 className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                         transition-colors ml-2"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div ref={containerRef} className="flex-1 overflow-auto min-h-[400px] relative">
          {hasPrev && (
            <button
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full
                         bg-dark-700/80 hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
              title="Previous file"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="min-w-full min-h-full flex items-center justify-center p-1">
            {isImage ? (
              <img
                src={file.url}
                alt={file.original_name}
                onLoad={handleImageLoad}
                style={naturalSize ? {
                  width: naturalSize.w * zoom,
                  height: 'auto',
                } : undefined}
                className="transition-all duration-200 block"
              />
            ) : (
              <video
                src={file.url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-lg"
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>

          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full
                         bg-dark-700/80 hover:bg-dark-600 text-gray-400 hover:text-white transition-colors"
              title="Next file"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Footer with metadata */}
        <div className="p-4 border-t border-dark-600 bg-dark-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Size</span>
              <p className="font-mono text-sm text-white">{formatFileSize(file.file_size)}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Type</span>
              <p className="font-mono text-sm text-white">{file.mime_type}</p>
            </div>
            {file.width && file.height && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">Dimensions</span>
                <p className="font-mono text-sm text-white">{file.width} x {file.height}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Created</span>
              <p className="font-mono text-sm text-white">{formatDate(file.created_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
