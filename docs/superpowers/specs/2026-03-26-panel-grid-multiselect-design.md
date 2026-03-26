# Panel: Grid View, Multi-Select, Bulk Actions, Prev/Next Preview

## Goal

Enhance the dashboard panel with a grid/tile view, multi-file selection with bulk delete and ZIP download, and prev/next navigation in file preview.

## Scope

1. View mode toggle (list/grid)
2. Grid (tile) view — 4 per row, thumbnail + date
3. Multi-select with checkboxes in both views
4. Bulk actions bar (delete, download ZIP) replacing toolbar when files selected
5. Prev/next navigation in FilePreview

## Out of Scope

- API changes (all bulk operations are client-side)
- Drag-to-select
- Bulk rename

---

## 1. View Mode Toggle

**State:** `viewMode: 'list' | 'grid'` in dashboard page.

**UI:** A separate toggle group in the toolbar, next to the type filter buttons. Two icons:
- `List` icon — list view (current)
- `Grid3X3` icon — grid view

The "All" filter button currently uses `LayoutGrid` icon. Change it to `Layers` to avoid confusion with the grid view toggle.

Persist `viewMode` in `localStorage` under key `cdn_view_mode`.

---

## 2. Grid View

New component: `FileGrid.tsx` (sibling to `FileTable.tsx`).

**Layout:** CSS grid, `grid-template-columns: repeat(4, 1fr)` on desktop, `repeat(2, 1fr)` on mobile.

**Tile structure:**
- Square thumbnail container with `aspect-ratio: 1`, `object-cover`
- Checkbox overlay in top-left corner (always visible)
- For images: `<img>` with `file.thumbnail_url || file.url`
- For videos without thumbnail: `FileVideo` icon centered
- Below thumbnail: date formatted as `DD.MM.YYYY` (e.g. `12.03.2026`)

**Interactions:**
- Click thumbnail → open FilePreview
- Click checkbox → toggle selection
- Lazy thumbnail generation: same `onLoad` pattern as FileTable (generate and upload thumbnail if missing)

**Props** (same interface as FileTable where applicable):
```ts
interface FileGridProps {
  files: FileData[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (file: FileData) => void;
  onRefresh: () => void;
}
```

---

## 3. Multi-Select

**State:** `selectedIds: Set<string>` in dashboard page, passed down to FileTable and FileGrid.

**FileTable changes:**
- New first column: checkbox (40px wide)
- Header row: "Select all" checkbox (selects/deselects all visible files)
- Each row: checkbox, checked if `selectedIds.has(file.id)`
- Clicking checkbox calls `onToggleSelect(file.id)`

**FileGrid changes:**
- Checkbox overlay on each tile (top-left, semi-transparent dark background behind it)
- "Select all" checkbox above the grid, aligned left

**Select all behavior:**
- If all visible files selected → deselect all
- Otherwise → select all visible files
- `onSelectAll: () => void` and `allSelected: boolean` props

**Clear selection** when:
- Page changes (pagination)
- Type filter changes
- Search changes

---

## 4. Bulk Actions Bar

When `selectedIds.size > 0`, the toolbar section (search, filter, view toggle) is replaced by:

```
[X] Zaznaczono: 5 plików          [Download ZIP]  [Usuń]
```

- **Left:** X button (close/clear selection) + count text
- **Right:** "Pobierz ZIP" button with `Download` icon, "Usuń" button with `Trash2` icon (red/destructive style)

**Bulk Delete:**
1. Confirm dialog: "Czy na pewno chcesz usunąć {n} plików?"
2. Iterate over selected IDs, call `api.deleteFile(id)` for each
3. Show progress toast or count ("Usunięto 3/5...")
4. After all complete: clear selection, call `fetchFiles()`
5. Show summary toast ("Usunięto 5 plików" or "Usunięto 4/5, 1 błąd")

**Bulk Download ZIP:**
1. Use `jszip` library (new dependency: `npm install jszip`)
2. For each selected file: fetch the file from its URL (`file.url`)
3. Add to ZIP archive with original filename (`file.original_name`)
4. Generate blob, trigger browser download as `my-cdn-files.zip`
5. Show progress ("Pobieranie 3/5...")
6. Handle errors gracefully (skip failed files, show count in summary)

---

## 5. Prev/Next in FilePreview

**New props for FilePreview:**
```ts
interface FilePreviewProps {
  file: FileData;
  files: FileData[];        // full list for navigation
  onClose: () => void;
  onNavigate: (file: FileData) => void;  // called when prev/next clicked
}
```

**UI:**
- Left arrow (`ChevronLeft`) — left side of the preview, vertically centered
- Right arrow (`ChevronRight`) — right side, vertically centered
- Arrows are semi-transparent, brighten on hover
- Disabled (dimmed, no pointer) when at first/last file

**Keyboard:**
- `ArrowLeft` → previous file
- `ArrowRight` → next file
- `Escape` → close (already works)

**Navigation logic:**
- Find current file index in `files` array
- Prev: `files[index - 1]` if exists
- Next: `files[index + 1]` if exists
- Reset zoom to fit-to-window when navigating

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/panel/src/components/FileGrid.tsx` | **New** — grid/tile view component |
| `apps/panel/src/components/FileTable.tsx` | Add checkbox column, multi-select props |
| `apps/panel/src/components/FilePreview.tsx` | Add prev/next navigation |
| `apps/panel/src/components/BulkActionsBar.tsx` | **New** — bulk actions toolbar |
| `apps/panel/src/app/dashboard/page.tsx` | Add viewMode state, selectedIds state, bulk actions logic, wire components |
| `apps/panel/package.json` | Add `jszip` dependency |

## New Dependency

- `jszip` — client-side ZIP generation. Lightweight, well-maintained, no native dependencies. Works in browser.

## Testing

- Toggle between list and grid view — verify files render correctly in both
- Select files via checkboxes — verify count updates in bulk bar
- Select all / deselect all — verify behavior
- Bulk delete — verify confirmation, progress, cleanup
- Bulk download ZIP — verify ZIP contains correct files with original names
- Prev/next in preview — verify navigation, keyboard, disabled at boundaries
- Grid view on mobile — verify 2 columns
- Changing page/filter clears selection
