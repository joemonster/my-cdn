'use client';

import { X, Download, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { FileData, formatFileSize, formatDate } from '@/lib/api';

interface FilePreviewProps {
  file: FileData;
  onClose: () => void;
}

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const [zoom, setZoom] = useState(1);
  const isImage = file.file_type === 'image';

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] m-4 flex flex-col bg-dark-800
                   rounded-xl border border-dark-600 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
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
                <span className="font-mono text-sm text-gray-400 min-w-[60px] text-center">
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
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
          {isImage ? (
            <div className="overflow-auto max-w-full max-h-full">
              <img
                src={file.url}
                alt={file.original_name}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                className="max-w-none transition-transform duration-200"
              />
            </div>
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
