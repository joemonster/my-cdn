'use client';

import { useState, useCallback, useRef } from 'react';
import { X, Upload, FileImage, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';
import { api, generateImageThumbnail, generateVideoThumbnail, formatFileSize } from '@/lib/api';
import toast from 'react-hot-toast';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

interface UploadModalProps {
  onClose: () => void;
  onUploadComplete: () => void;
}

interface UploadFile {
  file: File;
  thumbnail?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function UploadModal({ onClose, onUploadComplete }: UploadModalProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return `Invalid file type: ${file.type || 'unknown'}`;
    }

    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      return `File too large. Max: ${formatFileSize(maxSize)}`;
    }

    return null;
  };

  const processFile = async (file: File): Promise<UploadFile> => {
    const error = validateFile(file);
    if (error) {
      return { file, progress: 0, status: 'error', error };
    }

    let thumbnail: string | undefined;
    try {
      if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
        thumbnail = await generateImageThumbnail(file);
      } else if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
        thumbnail = await generateVideoThumbnail(file);
      }
    } catch (e) {
      console.error('Thumbnail generation failed:', e);
    }

    return { file, thumbnail, progress: 0, status: 'pending' };
  };

  const handleFiles = async (fileList: FileList) => {
    const newFiles = await Promise.all(
      Array.from(fileList).map(processFile)
    );
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (uploadFile: UploadFile, index: number) => {
    setFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, status: 'uploading' as const, progress: 0 } : f
      )
    );

    try {
      await api.uploadFile(
        uploadFile.file,
        uploadFile.thumbnail,
        (progress) => {
          setFiles((prev) =>
            prev.map((f, i) => (i === index ? { ...f, progress } : f))
          );
        }
      );

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'success' as const, progress: 100 } : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: 'error' as const, error: error instanceof Error ? error.message : 'Upload failed' }
            : f
        )
      );
    }
  };

  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast.error('No files to upload');
      return;
    }

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending') {
        await uploadFile(files[i], i);
      }
    }

    onUploadComplete();
    toast.success('Upload complete!');
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl m-4 bg-dark-800 rounded-xl border border-dark-600
                   overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <h2 className="text-xl font-semibold text-white">Upload Files</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                       transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop Zone */}
        <div className="p-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                       transition-all duration-300
              ${isDragging
                ? 'border-neon-cyan bg-neon-cyan/10 shadow-neon-cyan'
                : 'border-dark-500 hover:border-neon-cyan/50 hover:bg-dark-700'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-neon-cyan' : 'text-gray-500'}`} />
            <p className="text-lg text-gray-300 mb-2">
              {isDragging ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-gray-500">
              or click to select files
            </p>
            <p className="text-xs text-gray-600 mt-4 font-mono">
              Images: JPG, PNG, WebP, GIF (max 5MB) | Videos: MP4, WebM (max 15MB)
            </p>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="px-4 pb-4 max-h-64 overflow-y-auto">
            <div className="space-y-2">
              {files.map((uploadFile, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded bg-dark-600 flex-shrink-0 overflow-hidden">
                    {uploadFile.thumbnail ? (
                      <img
                        src={uploadFile.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : uploadFile.file.type.startsWith('image/') ? (
                      <FileImage className="w-6 h-6 m-3 text-neon-cyan" />
                    ) : (
                      <FileVideo className="w-6 h-6 m-3 text-neon-purple" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{uploadFile.file.name}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {formatFileSize(uploadFile.file.size)}
                    </p>

                    {/* Progress Bar */}
                    {uploadFile.status === 'uploading' && (
                      <div className="mt-1 h-1 bg-dark-500 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neon-cyan transition-all duration-300"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {uploadFile.error && (
                      <p className="text-xs text-red-400 mt-1">{uploadFile.error}</p>
                    )}
                  </div>

                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {uploadFile.status === 'success' && (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    )}
                    {uploadFile.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    {uploadFile.status === 'pending' && (
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 rounded hover:bg-dark-500 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <span className="font-mono text-sm text-neon-cyan">
                        {uploadFile.progress}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-dark-600 bg-dark-700">
          <div className="text-sm text-gray-400">
            {files.length > 0 && (
              <span>
                {pendingCount > 0 && `${pendingCount} pending`}
                {successCount > 0 && `${pendingCount > 0 ? ', ' : ''}${successCount} uploaded`}
                {errorCount > 0 && `${pendingCount > 0 || successCount > 0 ? ', ' : ''}${errorCount} failed`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-dark-600 text-gray-300 hover:bg-dark-500
                         transition-colors"
            >
              Close
            </button>
            <button
              onClick={uploadAll}
              disabled={pendingCount === 0}
              className="px-4 py-2 rounded-lg bg-neon-cyan text-dark-900 font-semibold
                         hover:bg-neon-cyan-dim disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 hover:shadow-neon-cyan"
            >
              Upload {pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
