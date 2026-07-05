interface ProgressBarProps {
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#d9e5e1]" role="progressbar" aria-label={`Progress ${safeValue}%`} aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100}>
      <span
        className="block h-full rounded-full bg-accent transition-[width] duration-180"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
