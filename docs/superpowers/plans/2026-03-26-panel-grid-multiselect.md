# Panel Grid View, Multi-Select & Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add grid/tile view, multi-file selection with bulk delete/ZIP download, and prev/next navigation in file preview.

**Architecture:** All changes are client-side in the Next.js panel. New components: FileGrid (tile view), BulkActionsBar (replaces toolbar when selecting). Modified: FileTable (checkboxes), FilePreview (prev/next), dashboard page (state management, view toggle). New dependency: jszip.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Lucide icons, jszip

**Spec:** `docs/superpowers/specs/2026-03-26-panel-grid-multiselect-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `apps/panel/src/components/FileGrid.tsx` | **New** — grid/tile view with checkboxes |
| `apps/panel/src/components/BulkActionsBar.tsx` | **New** — bulk actions toolbar (delete, ZIP download) |
| `apps/panel/src/components/FileTable.tsx` | Add checkbox column for multi-select |
| `apps/panel/src/components/FilePreview.tsx` | Add prev/next navigation with keyboard |
| `apps/panel/src/app/dashboard/page.tsx` | Wire everything: viewMode, selectedIds, bulk actions, view toggle |
| `apps/panel/package.json` | Add `jszip` dependency |

---

### Task 1: Install jszip dependency

**Files:**
- Modify: `apps/panel/package.json`

- [ ] **Step 1: Install jszip**

```bash
cd apps/panel && npm install jszip
```

- [ ] **Step 2: Verify build still works**

```bash
cd apps/panel && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add apps/panel/package.json apps/panel/package-lock.json
git commit -m "chore: add jszip dependency for bulk download"
```

---

### Task 2: Add prev/next navigation to FilePreview

**Files:**
- Modify: `apps/panel/src/components/FilePreview.tsx`

- [ ] **Step 1: Update FilePreviewProps interface**

In `apps/panel/src/components/FilePreview.tsx`, replace the interface (lines 19-22):

```tsx
interface FilePreviewProps {
  file: FileData;
  files: FileData[];
  onClose: () => void;
  onNavigate: (file: FileData) => void;
}
```

- [ ] **Step 2: Update component signature and add navigation logic**

Replace the component signature and add navigation logic. Replace line 24:

```tsx
export function FilePreview({ file, files, onClose, onNavigate }: FilePreviewProps) {
```

- [ ] **Step 3: Add useEffect for keyboard navigation and imports**

Add `useEffect` to the import (line 4):

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';
```

Add `ChevronLeft, ChevronRight` to lucide import (line 3):

```tsx
import { X, Download, ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
```

After the `handleZoomOut` function (after line 56), add:

```tsx
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
```

- [ ] **Step 4: Add navigation arrows to the preview content area**

Inside the preview content div (the div with `ref={containerRef}`, line 134), wrap the existing content. Replace the entire div (lines 134-159) with:

```tsx
        {/* Preview Content */}
        <div ref={containerRef} className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[400px] relative">
          {/* Prev arrow */}
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

          {isImage ? (
            <div className="overflow-auto flex items-center justify-center" style={{ maxWidth: '100%', maxHeight: '100%' }}>
              <img
                src={file.url}
                alt={file.original_name}
                onLoad={handleImageLoad}
                style={naturalSize ? {
                  width: naturalSize.w * zoom,
                  minWidth: naturalSize.w * zoom,
                  height: 'auto',
                } : undefined}
                className="transition-all duration-200"
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

          {/* Next arrow */}
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
```

- [ ] **Step 5: Verify build**

```bash
cd apps/panel && npm run build
```

Note: Build will fail until dashboard page passes the new props. That's expected — we'll fix it in Task 6.

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/components/FilePreview.tsx
git commit -m "feat: add prev/next navigation to file preview"
```

---

### Task 3: Add checkboxes to FileTable

**Files:**
- Modify: `apps/panel/src/components/FileTable.tsx`

- [ ] **Step 1: Update FileTableProps interface**

Replace the interface (lines 21-29):

```tsx
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
}
```

- [ ] **Step 2: Update component destructuring**

Replace lines 31-39:

```tsx
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
}: FileTableProps) {
```

- [ ] **Step 3: Add checkbox to table header**

Replace the header grid (lines 158-167). Change grid-cols to add 40px checkbox column:

```tsx
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
```

- [ ] **Step 4: Add checkbox to each row**

Replace the row grid (line 174). Change grid-cols to match header:

```tsx
            className="grid grid-cols-1 md:grid-cols-[40px_80px_1fr_100px_100px_100px_150px_80px] gap-4 p-4
                       hover:bg-dark-700/50 transition-colors group"
```

Add checkbox as first cell, right after the opening row div (before the `{/* Preview Thumbnail */}` comment):

```tsx
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
```

- [ ] **Step 5: Verify build compiles (will have type errors in dashboard until Task 6)**

```bash
cd apps/panel && npx tsc --noEmit 2>&1 | head -20
```

Expected: Errors in dashboard/page.tsx about missing props. FileTable.tsx itself should be clean.

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/components/FileTable.tsx
git commit -m "feat: add checkbox column to FileTable for multi-select"
```

---

### Task 4: Create FileGrid component

**Files:**
- Create: `apps/panel/src/components/FileGrid.tsx`

- [ ] **Step 1: Create the FileGrid component**

Create `apps/panel/src/components/FileGrid.tsx`:

```tsx
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
      {/* Select all */}
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

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {files.map((file) => (
          <div key={file.id} className="group">
            {/* Thumbnail */}
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

              {/* Checkbox overlay */}
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

            {/* Date */}
            <p className="mt-1.5 text-xs font-mono text-gray-500 text-center">
              {formatDateShort(file.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/panel/src/components/FileGrid.tsx
git commit -m "feat: add FileGrid tile view component"
```

---

### Task 5: Create BulkActionsBar component

**Files:**
- Create: `apps/panel/src/components/BulkActionsBar.tsx`

- [ ] **Step 1: Create the BulkActionsBar component**

Create `apps/panel/src/components/BulkActionsBar.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/panel/src/components/BulkActionsBar.tsx
git commit -m "feat: add BulkActionsBar component for multi-select actions"
```

---

### Task 6: Wire everything in dashboard page

This is the largest task — it connects all components and adds state management.

**Files:**
- Modify: `apps/panel/src/app/dashboard/page.tsx`

- [ ] **Step 1: Update imports**

Replace the lucide imports (lines 5-17):

```tsx
import {
  Upload,
  Search,
  RefreshCw,
  LogOut,
  CloudUpload,
  ImageIcon,
  Video,
  Layers,
  List,
  Grid3X3,
  Loader2,
  HelpCircle,
} from 'lucide-react';
```

Add new component imports after the existing ones (after line 23):

```tsx
import { FileGrid } from '@/components/FileGrid';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import JSZip from 'jszip';
```

- [ ] **Step 2: Add new state variables**

After the `previewFile` state (after line 52), add:

```tsx
  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cdn_view_mode') as 'list' | 'grid') || 'list';
    }
    return 'list';
  });

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
```

- [ ] **Step 3: Add view mode persistence effect**

After the existing useEffects (after line 99), add:

```tsx
  // Persist view mode
  useEffect(() => {
    localStorage.setItem('cdn_view_mode', viewMode);
  }, [viewMode]);
```

- [ ] **Step 4: Clear selection when filters change**

Inside the existing `handleTypeFilter` function (lines 118-121), add `setSelectedIds(new Set())`:

```tsx
  const handleTypeFilter = (type: FileTypeFilter) => {
    setTypeFilter(type);
    setPagination((p) => ({ ...p, page: 1 }));
    setSelectedIds(new Set());
  };
```

Inside `handlePageChange` (lines 113-115), add:

```tsx
  const handlePageChange = (page: number) => {
    setPagination((p) => ({ ...p, page }));
    setSelectedIds(new Set());
  };
```

Also clear selection when search changes — in the debounce useEffect (lines 64-69), after `setSearchDebounced(search)` add:

```tsx
      setSelectedIds(new Set());
```

- [ ] **Step 5: Add selection handler functions**

After `handleLogout` (after line 128), add:

```tsx
  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const allSelected = files.length > 0 && selectedIds.size === files.length;

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!confirm(`Czy na pewno chcesz usunąć ${selectedIds.size} plików?`)) return;

    setIsBulkDeleting(true);
    let deleted = 0;
    let failed = 0;

    for (const id of selectedIds) {
      try {
        await api.deleteFile(id);
        deleted++;
      } catch {
        failed++;
      }
    }

    setIsBulkDeleting(false);
    setSelectedIds(new Set());

    if (failed === 0) {
      toast.success(`Usunięto ${deleted} plików`);
    } else {
      toast.error(`Usunięto ${deleted}, błędów: ${failed}`);
    }

    fetchFiles();
  };

  // Bulk download ZIP
  const handleBulkDownload = async () => {
    setIsBulkDownloading(true);
    const zip = new JSZip();
    const selectedFiles = files.filter((f) => selectedIds.has(f.id));
    let downloaded = 0;

    try {
      for (const file of selectedFiles) {
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();
          zip.file(file.original_name, blob);
          downloaded++;
        } catch {
          // Skip failed files
        }
      }

      if (downloaded === 0) {
        toast.error('Nie udało się pobrać żadnego pliku');
        setIsBulkDownloading(false);
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-cdn-files.zip';
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Pobrano ${downloaded} plików w ZIP`);
    } catch {
      toast.error('Błąd podczas tworzenia ZIP');
    } finally {
      setIsBulkDownloading(false);
    }
  };
```

- [ ] **Step 6: Replace toolbar with conditional bulk actions bar**

Replace the entire toolbar section (lines 191-255) with:

```tsx
        {/* Toolbar / Bulk Actions */}
        {selectedIds.size > 0 ? (
          <BulkActionsBar
            selectedCount={selectedIds.size}
            onClearSelection={handleClearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkDownload={handleBulkDownload}
            isDeleting={isBulkDeleting}
            isDownloading={isBulkDownloading}
          />
        ) : (
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

            {/* Filters & View Toggle */}
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
                  <Layers className="w-4 h-4" />
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

              {/* View Toggle */}
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
        )}
```

- [ ] **Step 7: Replace FileTable usage with conditional view**

Replace the FileTable usage (lines 271-279) with:

```tsx
        {/* File List / Grid */}
        {viewMode === 'list' ? (
          <FileTable
            files={files}
            loading={loading}
            sort={sort}
            order={order}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            allSelected={allSelected}
            onSort={handleSort}
            onPreview={setPreviewFile}
            onRefresh={fetchFiles}
          />
        ) : (
          <FileGrid
            files={files}
            loading={loading}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            allSelected={allSelected}
            onPreview={setPreviewFile}
            onRefresh={fetchFiles}
          />
        )}
```

- [ ] **Step 8: Update FilePreview usage**

Replace the FilePreview usage (lines 304-306) with:

```tsx
      {previewFile && (
        <FilePreview
          file={previewFile}
          files={files}
          onClose={() => setPreviewFile(null)}
          onNavigate={setPreviewFile}
        />
      )}
```

- [ ] **Step 9: Remove unused LayoutGrid import**

The `LayoutGrid` import was removed in Step 1 (replaced by `Layers`). Also remove the `Filter` import if it's unused. The import line should now be:

```tsx
import {
  Upload,
  Search,
  RefreshCw,
  LogOut,
  CloudUpload,
  ImageIcon,
  Video,
  Layers,
  List,
  Grid3X3,
  Loader2,
  HelpCircle,
} from 'lucide-react';
```

- [ ] **Step 10: Verify build**

```bash
cd apps/panel && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/panel/src/app/dashboard/page.tsx
git commit -m "feat: wire grid view, multi-select, bulk actions, and prev/next preview"
```

---

### Task 7: Build, deploy, and test

- [ ] **Step 1: Build panel**

```bash
cd /c/Users/mariu/Appki/my-cdn && NEXT_PUBLIC_API_URL=https://my-cdn-api.literalnie.workers.dev npm run build:panel
```

- [ ] **Step 2: Deploy panel**

```bash
npm run deploy:panel
```

- [ ] **Step 3: Test view toggle**

Open `https://cdn.joe.pl/dashboard/`. Verify:
- List view shows files with checkboxes as first column
- Grid view shows 4 tiles per row with thumbnail + date
- Toggle persists after page refresh (localStorage)
- "All" filter now uses Layers icon instead of LayoutGrid

- [ ] **Step 4: Test multi-select**

- Click checkboxes on individual files → toolbar replaced by bulk actions bar
- "Zaznaczono: N" count updates correctly
- "Select all" checkbox selects/deselects all files
- Clicking X clears selection and restores toolbar
- Changing page/filter/search clears selection

- [ ] **Step 5: Test bulk delete**

- Select 2-3 files → click "Usuń" → confirm dialog → files deleted → toast
- Selection cleared after delete
- File list refreshed

- [ ] **Step 6: Test bulk download ZIP**

- Select files → click "Pobierz ZIP" → ZIP file downloads
- ZIP contains files with original filenames
- Progress indication during download

- [ ] **Step 7: Test prev/next in preview**

- Click a file to open preview
- Left/right arrows visible on sides
- Arrow keys navigate between files
- First file: no left arrow. Last file: no right arrow.
- Zoom resets when navigating
