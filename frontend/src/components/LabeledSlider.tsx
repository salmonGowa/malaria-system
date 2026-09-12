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
    <label className="labeled-slider">
      <div className="labeled-slider-top">
        <span>{label}</span>
        <span className="labeled-slider-value">{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={fillStyle}
      />
      {hint && <div className="labeled-slider-hint">{hint}</div>}
    </label>
  );
}
