'use client';

import { FileVideo, Undo2, Trash2 } from 'lucide-react';
import { FileData, api } from '@/lib/api';
import { AuthBlobImage } from './AuthBlobImage';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface FileGridProps {
  files: FileData[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
  trashMode?: boolean;
  onRestore?: (id: string) => Promise<void> | void;
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
  trashMode = false,
  onRestore,
}: FileGridProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    if (!onRestore) return;
    try {
      await onRestore(id);
      toast.success('File restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore');
    }
  };

  const handleDeleteForever = async (id: string) => {
    if (!confirm('Delete this file permanently? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.deleteFile(id, { force: true });
      toast.success('File deleted permanently');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/3] bg-dark-700 rounded-xl" />
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
      {!trashMode && (
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
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {files.map((file) => (
          <div key={file.id} className="group">
            <div
              className={`relative aspect-[4/3] rounded-xl overflow-hidden bg-dark-700 cursor-pointer
                         border-2 transition-all ${
                           !trashMode && selectedIds.has(file.id)
                             ? 'border-neon-cyan'
                             : 'border-transparent hover:border-dark-500'
                         }`}
              onClick={() => onPreview(file)}
            >
              {trashMode ? (
                file.file_type === 'image' || file.thumbnail_url ? (
                  <AuthBlobImage
                    id={file.id}
                    type={file.thumbnail_url ? 'thumbnail' : undefined}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileVideo className="w-12 h-12 text-neon-purple" />
                  </div>
                )
              ) : file.thumbnail_url ? (
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

              {trashMode ? (
                <div
                  className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleRestore(file.id)}
                    className="p-1.5 rounded bg-dark-900/80 hover:bg-neon-cyan/20 transition-colors"
                    title="Restore"
                  >
                    <Undo2 className="w-4 h-4 text-neon-cyan" />
                  </button>
                  <button
                    onClick={() => handleDeleteForever(file.id)}
                    disabled={deletingId === file.id}
                    className="p-1.5 rounded bg-dark-900/80 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Delete forever"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ) : (
                <div
                  className={`absolute top-2 left-2 transition-opacity duration-150 ${
                    selectedIds.size > 0
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                  }`}
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
              )}
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
