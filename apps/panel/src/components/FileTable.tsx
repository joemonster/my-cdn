'use client';

import { useState } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  FileImage,
  FileVideo,
  MoreVertical,
  Undo2,
} from 'lucide-react';
import { FileData, formatFileSize, formatDate, api, SortField, SortOrder } from '@/lib/api';
import toast from 'react-hot-toast';
import { AuthBlobImage } from './AuthBlobImage';

interface FileTableProps {
  files: FileData[];
  loading: boolean;
  sort: SortField;
  order: SortOrder;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onSort: (field: SortField) => void;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
  trashMode?: boolean;
  onRestore?: (id: string) => Promise<void> | void;
}

export function FileTable({
  files,
  loading,
  sort,
  order,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onSort,
  onPreview,
  onRefresh,
  trashMode = false,
  onRestore,
}: FileTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleStartEdit = (file: FileData) => {
    setEditingId(file.id);
    setEditingName(file.original_name);
    setActionMenuId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    try {
      await api.updateFile(id, editingName.trim());
      toast.success('File renamed');
      setEditingId(null);
      setEditingName('');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteFile(id);
      toast.success('File deleted');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

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

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => {
    const isActive = sort === field;
    return (
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-400
                   hover:text-neon-cyan transition-colors group"
      >
        {children}
        {isActive ? (
          order === 'asc' ? (
            <ArrowUp className="w-3 h-3 text-neon-cyan" />
          ) : (
            <ArrowDown className="w-3 h-3 text-neon-cyan" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-16 h-12 bg-dark-600 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-dark-600 rounded w-1/3" />
                <div className="h-3 bg-dark-600 rounded w-1/4" />
              </div>
              <div className="w-20 h-4 bg-dark-600 rounded" />
              <div className="w-24 h-4 bg-dark-600 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-12 text-center">
        <FileImage className="w-16 h-16 mx-auto text-gray-600 mb-4" />
        <h3 className="text-lg text-gray-400 mb-2">No files found</h3>
        <p className="text-sm text-gray-500">
          Upload some files to get started
        </p>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-visible">
      {/* Table Header */}
      <div className="hidden md:grid md:grid-cols-[40px_80px_1fr_100px_100px_100px_150px_80px] gap-4 p-4
                     bg-dark-700 border-b border-dark-600 rounded-t-xl">
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-dark-500 bg-dark-600 text-neon-cyan
                       focus:ring-neon-cyan/30 focus:ring-offset-0 cursor-pointer accent-[#00FFD1]"
          />
        </div>
        <span className="text-xs uppercase tracking-wide text-gray-500">Preview</span>
        <SortHeader field="original_name">Name</SortHeader>
        <span className="text-xs uppercase tracking-wide text-gray-500">Bucket</span>
        <span className="text-xs uppercase tracking-wide text-gray-500">Type</span>
        <SortHeader field="file_size">Size</SortHeader>
        <SortHeader field="created_at">Date</SortHeader>
        <span className="text-xs uppercase tracking-wide text-gray-500">Actions</span>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-dark-600">
        {files.map((file) => (
          <div
            key={file.id}
            className="grid grid-cols-1 md:grid-cols-[40px_80px_1fr_100px_100px_100px_150px_80px] gap-4 p-4
                       hover:bg-dark-700/50 transition-colors group"
          >
            {/* Checkbox */}
            <div className="hidden md:flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.has(file.id)}
                onChange={() => onToggleSelect(file.id)}
                className="w-4 h-4 rounded border-dark-500 bg-dark-600 text-neon-cyan
                           focus:ring-neon-cyan/30 focus:ring-offset-0 cursor-pointer accent-[#00FFD1]"
              />
            </div>

            {/* Preview Thumbnail */}
            <div
              onClick={() => onPreview(file)}
              className="w-16 h-12 rounded bg-dark-600 overflow-hidden cursor-pointer
                        hover:ring-2 hover:ring-neon-cyan/50 transition-all"
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
                    <FileVideo className="w-6 h-6 text-neon-purple" />
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
                      // Silently fail — thumbnail will be generated on next visit
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileVideo className="w-6 h-6 text-neon-purple" />
                </div>
              )}
            </div>

            {/* Name */}
            <div className="flex items-center min-w-0">
              {editingId === file.id ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(file.id);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="flex-1 px-2 py-1 bg-dark-600 border border-dark-500 rounded
                             text-white font-mono text-sm focus:outline-none focus:border-neon-cyan"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(file.id)}
                    className="p-1 rounded bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="text-sm text-white truncate" title={file.original_name}>
                  {file.original_name}
                </span>
              )}
            </div>

            {/* Bucket */}
            <div className="flex items-center">
              {file.bucket ? (
                <span className="px-2 py-1 rounded text-xs font-mono bg-dark-600 text-gray-300 truncate" title={file.bucket}>
                  {file.bucket}
                </span>
              ) : (
                <span className="text-xs text-gray-600">—</span>
              )}
            </div>

            {/* Type Badge */}
            <div className="flex items-center">
              <span
                className={`px-2 py-1 rounded text-xs font-mono uppercase
                  ${file.file_type === 'image'
                    ? 'bg-neon-cyan/20 text-neon-cyan'
                    : 'bg-neon-purple/20 text-neon-purple'}`}
              >
                {file.file_type}
              </span>
            </div>

            {/* Size */}
            <div className="flex items-center">
              <span className="font-mono text-sm text-gray-400">
                {formatFileSize(file.file_size)}
              </span>
            </div>

            {/* Date */}
            <div className="flex items-center">
              <span className="font-mono text-sm text-gray-500">
                {formatDate(file.created_at)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 relative">
              {trashMode ? (
                <>
                  <button
                    onClick={() => handleRestore(file.id)}
                    className="p-2 rounded hover:bg-neon-cyan/10 transition-colors"
                    title="Restore"
                  >
                    <Undo2 className="w-4 h-4 text-neon-cyan" />
                  </button>
                  <button
                    onClick={() => handleDeleteForever(file.id)}
                    disabled={deletingId === file.id}
                    className="p-2 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Delete forever"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onPreview(file)}
                    className="p-2 rounded hover:bg-dark-500 transition-colors md:hidden"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleCopyLink(file.url)}
                    className="p-2 rounded hover:bg-dark-500 transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-4 h-4 text-gray-400 hover:text-neon-cyan" />
                  </button>

                  {/* Actions Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setActionMenuId(actionMenuId === file.id ? null : file.id)}
                      className="p-2 rounded hover:bg-dark-500 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>

                    {actionMenuId === file.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionMenuId(null)}
                        />
                        <div className="absolute right-0 bottom-full mb-1 z-20 bg-dark-700 border border-dark-500
                                      rounded-lg shadow-lg py-1 min-w-[140px]">
                          <button
                            onClick={() => {
                              onPreview(file);
                              setActionMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Preview
                          </button>
                          <button
                            onClick={() => handleStartEdit(file)}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" /> Rename
                          </button>
                          <button
                            onClick={() => {
                              handleCopyLink(file.url);
                              setActionMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-600
                                     flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" /> Copy link
                          </button>
                          <hr className="my-1 border-dark-500" />
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this file?')) {
                                handleDelete(file.id);
                              }
                              setActionMenuId(null);
                            }}
                            disabled={deletingId === file.id}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10
                                     flex items-center gap-2 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deletingId === file.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
