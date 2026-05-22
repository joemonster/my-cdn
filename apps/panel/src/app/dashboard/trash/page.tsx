'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, List, Grid3X3, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { api, FileData, PaginationInfo } from '@/lib/api';
import { FileTable } from '@/components/FileTable';
import { FileGrid } from '@/components/FileGrid';
import { Pagination } from '@/components/Pagination';
import toast from 'react-hot-toast';

export default function TrashPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cdn_view_mode') as 'list' | 'grid') || 'list';
    }
    return 'list';
  });

  useEffect(() => {
    if (!api.isAuthenticated()) {
      router.replace('/');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getFiles({
        page: pagination.page,
        limit: pagination.limit,
        sort: 'created_at',
        order: 'desc',
        trash: true,
      });
      if (response.success) {
        setFiles(response.files);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    if (!checkingAuth) fetchFiles();
  }, [fetchFiles, checkingAuth]);

  useEffect(() => {
    localStorage.setItem('cdn_view_mode', viewMode);
  }, [viewMode]);

  const handleRestore = useCallback(async (id: string) => {
    await api.restoreFile(id);
    fetchFiles();
  }, [fetchFiles]);

  const handlePageChange = (page: number) => {
    setPagination((p) => ({ ...p, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <header className="sticky top-0 z-40 bg-dark-800/80 backdrop-blur-lg border-b border-dark-600">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a
              href="/dashboard"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dark-600 to-dark-700
                             border border-dark-500 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Trash</h1>
                <p className="text-xs text-gray-500 font-mono">Auto-purged after 14 days</p>
              </div>
            </a>

            <div className="flex items-center gap-2">
              <a
                href="/dashboard"
                className="flex items-center gap-2 p-2 rounded-lg bg-dark-600
                         hover:bg-neon-cyan/20 hover:text-neon-cyan transition-colors"
                title="Back to dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </a>
              <div className="flex items-center bg-dark-700 rounded-xl border border-dark-600 p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'list' ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={fetchFiles}
                disabled={loading}
                className="p-2.5 rounded-xl bg-dark-700 border border-dark-600 text-gray-400
                         hover:text-neon-cyan hover:border-neon-cyan/30 transition-all duration-200
                         disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="text-gray-500">
            <span className="text-white font-mono">{pagination.total}</span> file{pagination.total === 1 ? '' : 's'} in trash
          </span>
        </div>

        {viewMode === 'list' ? (
          <FileTable
            files={files}
            loading={loading}
            sort="created_at"
            order="desc"
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onSelectAll={() => {}}
            allSelected={false}
            onSort={() => {}}
            onPreview={() => {}}
            onRefresh={fetchFiles}
            trashMode
            onRestore={handleRestore}
          />
        ) : (
          <FileGrid
            files={files}
            loading={loading}
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onSelectAll={() => {}}
            allSelected={false}
            onPreview={() => {}}
            onRefresh={fetchFiles}
            trashMode
            onRestore={handleRestore}
          />
        )}

        {pagination.total_pages > 1 && (
          <div className="mt-6">
            <Pagination
              page={pagination.page}
              totalPages={pagination.total_pages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </main>
    </div>
  );
}
