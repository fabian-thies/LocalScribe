interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, disabled, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3.5 rounded-[12px] border border-border bg-surface p-3">
      <div className="min-w-0">
        <strong className="text-[13px]">{label}</strong>
        {description ? <div className="text-muted text-xs leading-[1.35]">{description}</div> : null}
      </div>
      <label className="relative w-12 h-7 shrink-0 cursor-pointer" aria-label={label}>
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-[#c2cfcb] transition-colors duration-160 peer-checked:bg-accent peer-focus-visible:[box-shadow:0_0_0_3px_rgba(11,107,95,0.22)] peer-disabled:cursor-not-allowed peer-disabled:opacity-60 after:absolute after:top-[3px] after:left-[3px] after:w-[22px] after:h-[22px] after:rounded-full after:bg-white after:[box-shadow:0_2px_6px_rgba(15,23,42,0.22)] after:transition-transform after:duration-160 after:content-[''] peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}
