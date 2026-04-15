"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { normalizeSearchQuery, paginateRows } from "@/lib/admin-ui";

type PagedRowsResult<T, TExtra> = {
  rows: T[];
  total: number;
  page: number;
  extra: TExtra;
};

type SearchRowsResult<T, TExtra> = {
  rows: T[];
  extra: TExtra;
};

export function useAdminTableController<T, TExtra>({
  token,
  pageSize,
  loadErrorMessage,
  fetchPage,
  fetchAll,
  filterRows,
  resetKey,
}: {
  token: string | null | undefined;
  pageSize: number;
  loadErrorMessage: string;
  fetchPage: (page: number) => Promise<PagedRowsResult<T, TExtra>>;
  fetchAll: () => Promise<SearchRowsResult<T, TExtra>>;
  filterRows: (rows: T[], query: string, extra: TExtra | null) => T[];
  resetKey?: string | number;
}) {
  const [page, setPage] = useState(1);
  const [query, setQueryState] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchQuery(deferredQuery);
  const searchActive = normalizedQuery.length > 0;
  const [pagedRows, setPagedRows] = useState<T[]>([]);
  const [pagedTotal, setPagedTotal] = useState(0);
  const [pagedExtra, setPagedExtra] = useState<TExtra | null>(null);
  const [searchRows, setSearchRows] = useState<T[] | null>(null);
  const [searchExtra, setSearchExtra] = useState<TExtra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const filteredSearchRows = useMemo(
    () => (searchActive ? filterRows(searchRows ?? [], normalizedQuery, searchExtra) : []),
    [filterRows, normalizedQuery, searchActive, searchExtra, searchRows],
  );

  const searchPage = useMemo(
    () => paginateRows(filteredSearchRows, page, pageSize),
    [filteredSearchRows, page, pageSize],
  );

  const total = searchActive ? searchPage.total : pagedTotal;
  const totalPages = searchActive ? searchPage.totalPages : Math.max(1, Math.ceil(pagedTotal / pageSize));
  const currentPage = searchActive ? searchPage.page : page;
  const rows = searchActive ? searchPage.rows : pagedRows;
  const extra = searchActive ? searchExtra : pagedExtra;

  useEffect(() => {
    setPage(1);
    setQueryState("");
    setSearchRows(null);
    setSearchExtra(null);
    setPagedRows([]);
    setPagedTotal(0);
    setPagedExtra(null);
  }, [resetKey, token]);

  useEffect(() => {
    if (!searchActive || currentPage === page) return;
    setPage(currentPage);
  }, [currentPage, page, searchActive]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (searchActive && searchRows !== null) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (searchActive) {
          const result = await fetchAll();
          if (cancelled) return;
          setSearchRows(result.rows);
          setSearchExtra(result.extra);
          return;
        }

        let result = await fetchPage(page);
        if (cancelled) return;

        const serverTotalPages = Math.max(1, Math.ceil(result.total / pageSize));
        if (result.rows.length === 0 && result.total > 0 && result.page > serverTotalPages) {
          result = await fetchPage(serverTotalPages);
          if (cancelled) return;
        }

        setPagedRows(result.rows);
        setPagedTotal(result.total);
        setPagedExtra(result.extra);

        if (result.page !== page) {
          setPage(result.page);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : loadErrorMessage);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchAll, fetchPage, loadErrorMessage, page, pageSize, reloadKey, searchActive, searchRows, token]);

  const setQuery = (nextQuery: string) => {
    setQueryState(nextQuery);
    setPage(1);
  };

  const refresh = (nextPage = 1) => {
    setSearchRows(null);
    setSearchExtra(null);
    setPage(nextPage);
    setReloadKey((current) => current + 1);
  };

  const updateRows = (updateRow: (row: T) => T) => {
    setPagedRows((current) => current.map(updateRow));
    setSearchRows((current) => (current ? current.map(updateRow) : current));
  };

  return {
    currentPage,
    error,
    extra,
    loading,
    query,
    rows,
    searchActive,
    setError,
    setPage,
    setQuery,
    total,
    totalPages,
    updateRows,
    refresh,
  };
}
