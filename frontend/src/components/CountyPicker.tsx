import type { ReactNode } from "react";

import type { County } from "../api/client";

interface CountyPickerProps {
  counties: County[];
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
  /** Optional small note under each county's name (e.g. its last forecast). */
  hint?: (county: County) => ReactNode;
}

/** Was `.county-picker-item` — also used standalone by Counties.tsx's own
 * "endemic focus" checkbox, which isn't inside a CountyPicker. */
export const COUNTY_PICKER_ITEM_CLASS = "flex items-center gap-1.5 text-[0.8125rem] text-text-secondary cursor-pointer";

const CHECKBOX_CLASS = "accent-accent w-[15px] h-[15px] shrink-0 cursor-pointer";

export default function CountyPicker({ counties, selected, onChange, hint }: CountyPickerProps) {
  const allSelected = counties.length > 0 && selected.size === counties.length;

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  const toggleAll = () => {
    onChange(allSelected ? new Set() : new Set(counties.map((c) => c.id)));
  };

  return (
    <div className="border border-border rounded-lg py-2.5 px-3 bg-panel-muted mb-3" data-testid="county-picker">
      <label className="flex items-center gap-2 font-semibold text-[0.8125rem] pb-2 mb-2 border-b border-border cursor-pointer">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selected.size > 0 && !allSelected;
          }}
          onChange={toggleAll}
        />
        <span>
          All counties ({selected.size}/{counties.length})
        </span>
      </label>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-2.5 gap-y-1.5 max-h-40 overflow-y-auto">
        {counties.map((c) => (
          <label key={c.id} className={COUNTY_PICKER_ITEM_CLASS}>
            <input
              type="checkbox"
              className={CHECKBOX_CLASS}
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              // Explicit name: exactly the county, even with a hint inside the label
              // (e2e/helpers.ts selects checkboxes by exact county name).
              aria-label={c.name}
              aria-describedby={hint ? `county-hint-${c.id}` : undefined}
            />
            {hint ? (
              <span className="min-w-0 leading-tight">
                <span className="block">{c.name}</span>
                {/* Announced as the checkbox's description, not part of its name. */}
                <span id={`county-hint-${c.id}`} aria-hidden="true" className="block text-[0.6875rem] text-muted">
                  {hint(c)}
                </span>
              </span>
            ) : (
              <span>{c.name}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
