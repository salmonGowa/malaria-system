import type { County } from "../api/client";

interface CountyPickerProps {
  counties: County[];
  selected: Set<number>;
  onChange: (selected: Set<number>) => void;
}

export default function CountyPicker({ counties, selected, onChange }: CountyPickerProps) {
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
    <div className="county-picker">
      <label className="county-picker-all">
        <input
          type="checkbox"
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
      <div className="county-picker-list">
        {counties.map((c) => (
          <label key={c.id} className="county-picker-item">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
