import { useState, useMemo, useCallback, useRef } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  visiblePages: number[];
}

export interface UsePaginationReturn extends PaginationState {
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  paginate: <T>(items: T[]) => T[];
  setTotalItems: (n: number) => void;
  PAGE_SIZE_OPTIONS: number[];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function useSmartPagination(initialPageSize = 25): UsePaginationReturn {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);
  const [totalItems, setTotalItemsRaw] = useState(0);
  const totalItemsRef = useRef(0);

  const setTotalItems = useCallback((n: number) => {
    if (totalItemsRef.current !== n) {
      totalItemsRef.current = n;
      setTotalItemsRaw(n);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const setPage = useCallback((p: number) => {
    setPageRaw(Math.max(1, Math.min(p, Math.max(1, Math.ceil(totalItems / pageSize)))));
  }, [totalItems, pageSize]);

  const setPageSize = useCallback((s: number) => {
    setPageSizeRaw(s);
    setPageRaw(1);
  }, []);

  const nextPage = useCallback(() => setPage(page + 1), [page, setPage]);
  const prevPage = useCallback(() => setPage(page - 1), [page, setPage]);
  const firstPage = useCallback(() => setPage(1), [setPage]);
  const lastPage = useCallback(() => setPage(totalPages), [setPage, totalPages]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - 2);
      let end = Math.min(totalPages - 1, page + 2);
      if (page <= 3) { start = 2; end = 5; }
      if (page >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
      if (start > 2) pages.push(-1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push(-2);
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  const paginate = useCallback(<T,>(items: T[]): T[] => {
    if (items.length !== totalItemsRef.current) {
      setTimeout(() => setTotalItems(items.length), 0);
    }
    return items.slice(startIndex, startIndex + pageSize);
  }, [startIndex, pageSize, setTotalItems]);

  return {
    page, pageSize, totalItems, totalPages, startIndex, endIndex,
    hasNext, hasPrev, visiblePages, setPage, setPageSize,
    nextPage, prevPage, firstPage, lastPage, paginate, setTotalItems,
    PAGE_SIZE_OPTIONS,
  };
}
