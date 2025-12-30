'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    const halfShow = Math.floor(showPages / 2);

    let start = Math.max(1, page - halfShow);
    let end = Math.min(totalPages, start + showPages - 1);

    if (end - start + 1 < showPages) {
      start = Math.max(1, end - showPages + 1);
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(1)}
        disabled={page === 1}
        className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 disabled:opacity-50
                   disabled:cursor-not-allowed transition-all duration-200
                   hover:shadow-neon-cyan-sm"
        title="First page"
      >
        <ChevronsLeft className="w-4 h-4 text-gray-400" />
      </button>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 disabled:opacity-50
                   disabled:cursor-not-allowed transition-all duration-200
                   hover:shadow-neon-cyan-sm"
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4 text-gray-400" />
      </button>

      <div className="flex items-center gap-1 mx-2">
        {getPageNumbers().map((pageNum, index) =>
          typeof pageNum === 'number' ? (
            <button
              key={index}
              onClick={() => onPageChange(pageNum)}
              className={`w-10 h-10 rounded-lg font-mono text-sm transition-all duration-200
                ${page === pageNum
                  ? 'bg-neon-cyan text-dark-900 font-bold shadow-neon-cyan'
                  : 'bg-dark-600 text-gray-400 hover:bg-dark-500 hover:text-white'
                }`}
            >
              {pageNum}
            </button>
          ) : (
            <span key={index} className="px-2 text-gray-500 font-mono">
              {pageNum}
            </span>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 disabled:opacity-50
                   disabled:cursor-not-allowed transition-all duration-200
                   hover:shadow-neon-cyan-sm"
        title="Next page"
      >
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </button>

      <button
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
        className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 disabled:opacity-50
                   disabled:cursor-not-allowed transition-all duration-200
                   hover:shadow-neon-cyan-sm"
        title="Last page"
      >
        <ChevronsRight className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}
