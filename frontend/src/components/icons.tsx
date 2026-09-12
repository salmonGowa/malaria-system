import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

/** Shared stroke defaults so every nav/chrome icon reads as one consistent set. */
function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 15l4-5 3 3 5-7" />
    </Svg>
  );
}

export function SimulationIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v5.2a2 2 0 0 1-.4 1.2L4.9 16a2 2 0 0 0 1.6 3.2h11a2 2 0 0 0 1.6-3.2l-4.7-6.6a2 2 0 0 1-.4-1.2V3" />
      <path d="M7.5 14h9" />
    </Svg>
  );
}

export function CaseReportIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v2h6V3" />
      <path d="M9 11h6M9 15h6M9 7h2" />
    </Svg>
  );
}

export function ForecastIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17l5-6 4 3 5-8 4 5" />
      <path d="M3 21h18" />
    </Svg>
  );
}

export function AllocationIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 3.5l6 6-2 2-1-1-7.5 7.5H6v-4l7.5-7.5-1-1z" />
      <path d="M4 20l2-2" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </Svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" />
    </Svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}
