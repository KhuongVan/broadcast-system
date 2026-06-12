import { useEffect, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 10;

type PaginationProps = {
  page: number;
  pageSize?: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function paginate<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const start = (Math.max(page, 1) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getTotalPages(totalItems: number, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(Math.ceil(totalItems / pageSize), 1);
}

export function usePagination(totalItems: number, pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = getTotalPages(totalItems, pageSize);

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages));
  }, [totalPages]);

  return { page, pageSize, setPage, totalPages };
}

export function Pagination({ page, pageSize = DEFAULT_PAGE_SIZE, totalItems, onPageChange }: PaginationProps) {
  const totalPages = getTotalPages(totalItems, pageSize);
  if (totalItems <= pageSize || totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pages = getVisiblePages(safePage, totalPages);

  return (
    <div className="pagination-bar">
      <span>
        Trang {safePage}/{totalPages} · Tổng {totalItems} bản ghi
      </span>
      <div className="pagination-actions">
        <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} type="button">
          Trước
        </button>
        {pages.map((item, index) =>
          item === 'gap' ? (
            <span className="pagination-gap" key={`gap-${index}`}>...</span>
          ) : (
            <button
              className={item === safePage ? 'active' : ''}
              key={item}
              onClick={() => onPageChange(item)}
              type="button"
            >
              {item}
            </button>
          ),
        )}
        <button disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} type="button">
          Sau
        </button>
      </div>
    </div>
  );
}

function getVisiblePages(page: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, page]);
  if (page > 1) pages.add(page - 1);
  if (page < totalPages) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.reduce<Array<number | 'gap'>>((items, value, index) => {
    const previous = sorted[index - 1];
    if (previous && value - previous > 1) items.push('gap');
    items.push(value);
    return items;
  }, []);
}
