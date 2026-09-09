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
export const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value ?? 0))
export const formatDate = (value, withTime = false) => value ? new Intl.DateTimeFormat('id-ID', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value)) : '-'
