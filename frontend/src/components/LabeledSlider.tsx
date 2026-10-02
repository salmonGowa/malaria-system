import type { CSSProperties } from "react";

interface LabeledSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  hint?: string;
}

export default function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
  hint,
}: LabeledSliderProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const fillStyle = { "--fill": `${percent}%` } as CSSProperties;

  return (
    <label className="block mb-3.5">
      <div className="flex justify-between text-[0.8125rem] mb-1.5 text-text-secondary">
        <span>{label}</span>
        <span className="text-accent-text font-mono font-semibold">{formatValue ? formatValue(value) : value}</span>
      </div>
      {/* Cross-browser range-thumb styling (::-webkit-slider-thumb, ::-moz-range-thumb/-track/-progress)
          has no Tailwind utility equivalent without a plugin, so this one input keeps its own scoped
          rule in index.css's "Sliders" section rather than becoming unreadable arbitrary-variant soup. */}
      <input
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={fillStyle}
      />
      {hint && <div className="text-muted text-[0.71875rem] mt-1">{hint}</div>}
    </label>
  );
}
