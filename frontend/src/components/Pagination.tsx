import { btnClass } from "../lib/buttonClasses";

interface PaginationProps {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, count, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (count === 0) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, count);

  return (
    // Tailwind incremental migration (see index.css's own "Tailwind" header
    // comment) — this component's own layout classes are Tailwind
    // utilities now; the buttons use the shared btnClass() helper
    // (lib/buttonClasses.ts), the same one every other page's buttons are
    // migrating to.
    <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4 pt-3.5 border-t border-border text-[0.8125rem] text-muted">
      <span className="tabular-nums">
        {rangeStart}–{rangeEnd} of {count}
      </span>
      <div className="flex items-center gap-2.5">
        <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span className="tabular-nums text-text-secondary whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <button type="button" className={btnClass("secondary", { sm: true })} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}
