import { useEffect, type ReactNode } from 'react';
import { IconCheck, IconInfo, IconWarn } from './icons';

export function Stepper(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: ReactNode;
  hit?: boolean;
  format?: (v: number) => string;
}) {
  const { label, value, onChange, step = 1, min = 0, max = 999, unit, hint, hit, format } = props;
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
  return (
    <div className={`stepper${hit ? ' target-hit' : ''}`}>
      <div className="label">{label}</div>
      <div className="controls">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => set(value - step)}>
          −
        </button>
        <div className="value">
          {format ? format(value) : value}
          {unit && <small>{unit}</small>}
        </div>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => set(value + step)}>
          +
        </button>
      </div>
      <div className="hint">{hint}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function ToggleRow(props: { title: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="label">
        <div style={{ fontWeight: 650 }}>{props.title}</div>
        {props.description && <div className="muted" style={{ fontSize: 15 }}>{props.description}</div>}
      </div>
      <Switch checked={props.checked} onChange={props.onChange} label={String(props.title)} />
    </div>
  );
}

export function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`check${on ? ' on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="box">{on && <IconCheck width={20} height={20} />}</span>
      <span>{children}</span>
    </button>
  );
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'good' | 'plain'; children: ReactNode }) {
  return (
    <div className={`note ${kind}`}>
      {kind === 'warn' ? <IconWarn /> : kind === 'good' ? <IconCheck /> : <IconInfo />}
      <div>{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}

export function Chips<T extends string>(props: { options: { id: T; label: string }[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {props.options.map((o) => (
        <button key={o.id} type="button" className={`chip${o.id === props.value ? ' on' : ''}`} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
