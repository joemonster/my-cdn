'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Search,
  RefreshCw,
  LogOut,
  CloudUpload,
  Filter,
  ImageIcon,
  Video,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import { api, FileData, SortField, SortOrder, FileTypeFilter, PaginationInfo } from '@/lib/api';
import { FileTable } from '@/components/FileTable';
import { UploadModal } from '@/components/UploadModal';
import { FilePreview } from '@/components/FilePreview';
import { Pagination } from '@/components/Pagination';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();

  // Auth state
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Files state
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });

  // Filters & Sorting
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Modals
  const [showUpload, setShowUpload] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);

  // Check authentication
  useEffect(() => {
    if (!api.isAuthenticated()) {
      router.replace('/');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch files
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getFiles({
        page: pagination.page,
        limit: pagination.limit,
        sort,
        order,
        type: typeFilter,
        search: searchDebounced || undefined,
      });

      if (response.success) {
        setFiles(response.files);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sort, order, typeFilter, searchDebounced]);

  useEffect(() => {
    if (!checkingAuth) {
      fetchFiles();
    }
  }, [fetchFiles, checkingAuth]);

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    setPagination((p) => ({ ...p, page }));
  };

  // Handle type filter
  const handleTypeFilter = (type: FileTypeFilter) => {
    setTypeFilter(type);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // Handle logout
  const handleLogout = () => {
    api.logout();
    router.replace('/');
    toast.success('Logged out');
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
      {/* Header */}
      <header className="sticky top-0 z-40 bg-dark-800/80 backdrop-blur-lg border-b border-dark-600">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dark-600 to-dark-700
                             border border-dark-500 flex items-center justify-center">
                <CloudUpload className="w-5 h-5 text-neon-cyan" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">My CDN</h1>
                <p className="text-xs text-gray-500 font-mono">Admin Panel</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 bg-neon-cyan text-dark-900 font-semibold
                         rounded-lg hover:bg-neon-cyan-dim transition-all duration-200
                         hover:shadow-neon-cyan"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-dark-600 hover:bg-red-500/20 hover:text-red-400
                         transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-11 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl
                       text-white placeholder-gray-500 font-mono text-sm
                       focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30
                       transition-all duration-200"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Type Filter */}
            <div className="flex items-center bg-dark-700 rounded-xl border border-dark-600 p-1">
              <button
                onClick={() => handleTypeFilter('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all
                  ${typeFilter === 'all'
                    ? 'bg-dark-500 text-white'
                    : 'text-gray-400 hover:text-white'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">All</span>
              </button>
              <button
                onClick={() => handleTypeFilter('image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all
                  ${typeFilter === 'image'
                    ? 'bg-neon-cyan/20 text-neon-cyan'
                    : 'text-gray-400 hover:text-white'}`}
              >
                <ImageIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Images</span>
              </button>
              <button
                onClick={() => handleTypeFilter('video')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all
                  ${typeFilter === 'video'
                    ? 'bg-neon-purple/20 text-neon-purple'
                    : 'text-gray-400 hover:text-white'}`}
              >
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">Videos</span>
              </button>
            </div>

            {/* Refresh */}
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

        {/* Stats Bar */}
        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="text-gray-500">
            Showing <span className="text-white font-mono">{files.length}</span> of{' '}
            <span className="text-white font-mono">{pagination.total}</span> files
          </span>
          {searchDebounced && (
            <span className="text-gray-500">
              Searching: <span className="text-neon-cyan font-mono">&quot;{searchDebounced}&quot;</span>
            </span>
          )}
        </div>

        {/* File Table */}
        <FileTable
          files={files}
          loading={loading}
          sort={sort}
          order={order}
          onSort={handleSort}
          onPreview={setPreviewFile}
          onRefresh={fetchFiles}
        />

        {/* Pagination */}
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

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploadComplete={() => {
            fetchFiles();
          }}
        />
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
