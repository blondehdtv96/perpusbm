export function PageHeader({ eyebrow, title, description, actions }) {
  return <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-tight text-navy-950">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}</div>{actions && <div className="shrink-0">{actions}</div>}</header>
}
export function Panel({ title, description, action, children, className = '' }) {
  return <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[.025] ${className}`}><header className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6"><div><h2 className="text-lg font-black text-navy-950">{title}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>{action}</header><div className="p-5 sm:p-6">{children}</div></section>
}
export function Feedback({ type = 'info', children }) {
  const style = { success: 'border-emerald-200 bg-emerald-50 text-emerald-800', error: 'border-red-200 bg-red-50 text-red-700', warning: 'border-amber-200 bg-amber-50 text-amber-800', info: 'border-blue-200 bg-blue-50 text-blue-800' }[type]
  return <div role={type === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${style}`}>{children}</div>
}
export function EmptyState({ title, description, icon = '—' }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl font-black text-slate-400 shadow-sm" aria-hidden="true">{icon}</span><h3 className="mt-4 font-black text-slate-700">{title}</h3>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
}
export function LoadingRows({ count = 4 }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div>
}
export function Tabs({ items, value, onChange }) {
  return <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1" role="tablist">{items.map((item) => <button type="button" role="tab" aria-selected={value === item.value} key={item.value} onClick={() => onChange(item.value)} className={`min-h-10 rounded-xl px-4 text-sm font-bold transition ${value === item.value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{item.label}</button>)}</div>
}
export function Spinner({ size = 16, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
}
export function BusyLabel({ busy = false, busyText, children, spinnerSize = 15 }) {
  return <span className="inline-flex items-center justify-center gap-2">{busy && <Spinner size={spinnerSize} />}<span>{busy && busyText ? busyText : children}</span></span>
}
export function ProgressBar({ value = null, label, hint, tone = 'blue' }) {
  const bar = { blue: 'bg-blue-600', navy: 'bg-navy-900', emerald: 'bg-emerald-600' }[tone] ?? 'bg-blue-600'
  const indeterminate = value === null
  const percent = indeterminate ? 100 : Math.min(100, Math.max(0, Math.round(value)))
  return <div className="space-y-1.5">
    {(label || !indeterminate) && <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600"><span className="inline-flex items-center gap-2">{indeterminate && <Spinner size={13} />}{label}</span>{!indeterminate && <span className="tabular-nums text-slate-500">{percent}%</span>}</div>}
    <div role="progressbar" aria-label={label ?? 'Memproses'} aria-valuemin="0" aria-valuemax="100" {...(indeterminate ? {} : { 'aria-valuenow': percent })} className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${bar} ${indeterminate ? 'app-progress-indeterminate w-2/5' : 'transition-[width] duration-300 ease-out'}`} style={indeterminate ? undefined : { width: `${percent}%` }} />
    </div>
    {hint && <p className="text-[11px] font-semibold text-slate-400">{hint}</p>}
  </div>
}
export function LoadingOverlay({ show, label = 'Memperbarui data…' }) {
  if (!show) return null
  return <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-white/70 backdrop-blur-[1px]" role="status" aria-live="polite"><span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm"><Spinner size={15} className="text-blue-700" />{label}</span></div>
}
