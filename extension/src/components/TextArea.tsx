import { useId, type TextareaHTMLAttributes } from "react";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  help?: string;
}

export function TextArea({ label, help, ...props }: TextAreaProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-text text-[13px] font-bold">{label}</label>
      <textarea
        id={id}
        className="field-control min-h-[132px] resize-y"
        {...props}
      />
      {help ? <span className="text-muted text-xs leading-[1.35]">{help}</span> : null}
    </div>
  );
}
