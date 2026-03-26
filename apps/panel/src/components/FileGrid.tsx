'use client';

import { FileVideo } from 'lucide-react';
import { FileData, api } from '@/lib/api';

interface FileGridProps {
  files: FileData[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function FileGrid({
  files,
  loading,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onPreview,
  onRefresh,
}: FileGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square bg-dark-700 rounded-xl" />
            <div className="h-3 bg-dark-700 rounded mt-2 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-12 text-center">
        <FileVideo className="w-16 h-16 mx-auto text-gray-600 mb-4" />
        <h3 className="text-lg text-gray-400 mb-2">No files found</h3>
        <p className="text-sm text-gray-500">Upload some files to get started</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="w-4 h-4 rounded border-dark-500 bg-dark-600 text-neon-cyan
                     focus:ring-neon-cyan/30 focus:ring-offset-0 cursor-pointer accent-[#00FFD1]"
        />
        <span className="text-xs text-gray-500 uppercase tracking-wide">Select all</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {files.map((file) => (
          <div key={file.id} className="group">
            <div
              className={`relative aspect-square rounded-xl overflow-hidden bg-dark-700 cursor-pointer
                         border-2 transition-all ${
                           selectedIds.has(file.id)
                             ? 'border-neon-cyan'
                             : 'border-transparent hover:border-dark-500'
                         }`}
              onClick={() => onPreview(file)}
            >
              {file.thumbnail_url ? (
                <img
                  src={file.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : file.file_type === 'image' ? (
                <img
                  src={file.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onLoad={async (e) => {
                    try {
                      const img = e.currentTarget;
                      const canvas = document.createElement('canvas');
                      const MAX_SIZE = 200;
                      let width = img.naturalWidth;
                      let height = img.naturalHeight;

                      if (width > height) {
                        if (width > MAX_SIZE) {
                          height = Math.round((height * MAX_SIZE) / width);
                          width = MAX_SIZE;
                        }
                      } else {
                        if (height > MAX_SIZE) {
                          width = Math.round((width * MAX_SIZE) / height);
                          height = MAX_SIZE;
                        }
                      }

                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return;
                      ctx.drawImage(img, 0, 0, width, height);
                      const base64 = canvas.toDataURL('image/jpeg', 0.8);
                      await api.uploadThumbnail(file.id, base64);
                    } catch {
                      // Silently fail
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileVideo className="w-12 h-12 text-neon-purple" />
                </div>
              )}

              <div
                className="absolute top-2 left-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(file.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={() => {}}
                  className="w-5 h-5 rounded border-dark-400 bg-dark-800/80 text-neon-cyan
                             focus:ring-0 cursor-pointer accent-[#00FFD1]"
                />
              </div>
            </div>

            <p className="mt-1.5 text-xs font-mono text-gray-500 text-center">
              {formatDateShort(file.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
