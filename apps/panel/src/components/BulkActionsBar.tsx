'use client';

import { X, Trash2, Download, Loader2 } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkDownload: () => void;
  isDeleting: boolean;
  isDownloading: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkDownload,
  isDeleting,
  isDownloading,
}: BulkActionsBarProps) {
  const busy = isDeleting || isDownloading;

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={onClearSelection}
          disabled={busy}
          className="p-2 rounded-lg bg-dark-700 border border-dark-600 text-gray-400
                     hover:text-white hover:border-dark-500 transition-colors disabled:opacity-50"
          title="Clear selection"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm text-white">
          Zaznaczono: <span className="font-mono text-neon-cyan">{selectedCount}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onBulkDownload}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-700 border border-dark-600
                     text-gray-300 hover:text-neon-cyan hover:border-neon-cyan/30 transition-all
                     disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span className="text-sm">{isDownloading ? 'Pobieranie...' : 'Pobierz ZIP'}</span>
        </button>

        <button
          onClick={onBulkDelete}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30
                     text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-all
                     disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          <span className="text-sm">{isDeleting ? 'Usuwanie...' : 'Usuń'}</span>
        </button>
      </div>
    </div>
  );
}
