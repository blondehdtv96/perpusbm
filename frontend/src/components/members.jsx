import { useEffect, useRef } from 'react'
import { API_URL, optionLabel, slug, statuses, statusStyles } from '../lib/members'

// Kendali isian dan potongan tampilan yang dipakai bersama halaman Daftar anggota,
// Tambah anggota, dan Admin & Petugas. Istilah serta helper-nya ada di lib/members.js.

export function PhotoPicker({ picker, serverError, hint = 'JPG, PNG, atau WEBP. Maksimal 2 MB. Pakai foto potret agar rapi di kartu.' }) {
  const inputRef = useRef(null)
  const message = picker.error || serverError

  // Nilai elemen input ikut dibersihkan saat fotonya dilepas, supaya memilih berkas
  // yang sama sekali lagi tetap memicu perubahan.
  useEffect(() => { if (!picker.photo && inputRef.current) inputRef.current.value = '' }, [picker.photo])

  return <div className="flex items-start gap-3">
    {picker.preview
      ? <img src={picker.preview} alt="Pratinjau foto" className="h-28 w-24 shrink-0 rounded-2xl border border-slate-200 object-cover" />
      : <div className="grid h-28 w-24 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center text-[11px] font-bold text-slate-400">Belum ada foto</div>}
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => inputRef.current?.click()} className="min-h-10 rounded-xl border border-blue-700 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">{picker.photo ? 'Ganti foto' : 'Pilih foto'}</button>
      {picker.photo && <button type="button" onClick={picker.clear} className="min-h-10 rounded-xl px-3 text-xs font-bold text-red-600 hover:bg-red-50">Hapus foto</button>}
      <p className="max-w-[9rem] text-[11px] leading-4 text-slate-500">{hint}</p>
      {message && <p className="max-w-[9rem] text-[11px] font-semibold text-red-600">{message}</p>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => picker.select(event.target.files?.[0] ?? null)} className="sr-only" />
    </div>
  </div>
}

export function Step({ number, title, description, children }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white" aria-hidden="true">{number}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black text-navy-950">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  </section>
}

export function Field({ label, value, onChange, type = 'text', required = false, minLength, hint, error, action, className = '' }) {
  return <div className={`text-sm font-bold ${className}`}>
    <div className="flex items-end justify-between gap-2"><label htmlFor={`field-${slug(label)}`}>{label}</label>{action && <span className="text-xs font-normal">{action}</span>}</div>
    <input id={`field-${slug(label)}`} type={type} value={value} required={required} minLength={minLength} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border bg-white px-3 font-normal outline-none focus:ring-4 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'}`} />
    {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </div>
}

export function Select({ label, value, onChange, options, placeholder, error, action, disabled = false, hint }) {
  return <div className="text-sm font-bold">
    <div className="flex items-end justify-between gap-2"><label htmlFor={`select-${slug(label)}`}>{label}</label>{action && <span className="text-xs font-normal">{action}</span>}</div>
    <select id={`select-${slug(label)}`} value={value} disabled={disabled} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border bg-white px-3 font-normal outline-none focus:ring-4 disabled:bg-slate-100 disabled:text-slate-400 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(([itemValue, itemLabel]) => <option key={itemValue} value={itemValue}>{itemLabel}</option>)}
    </select>
    {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </div>
}

export function FilterField({ label, children, className = '' }) {
  return <label className={className}><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>
}

// Foto anggota dipakai pada daftar maupun kartu; inisial nama tetap dipakai bila fotonya belum ada.
export function Avatar({ user, className }) {
  if (user.photo_path) {
    return <img src={`${API_URL}/storage/${user.photo_path}`} alt={`Foto ${user.name}`} className={`${className} shrink-0 rounded-full border border-slate-200 object-cover`} />
  }
  return <div className={`${className} grid shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-800`}>{user.name.charAt(0).toUpperCase()}</div>
}

export function StatusBadge({ status }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[status] ?? 'bg-slate-100 text-slate-700'}`}>{optionLabel(statuses, status)}</span>
}

export function PlacementCell({ user }) {
  if (user.placement) {
    return <span className="block"><span className="font-semibold text-slate-800">{user.placement.class_name}</span><span className="mt-0.5 block text-xs text-slate-500">{user.placement.major} • {user.placement.academic_year}</span></span>
  }
  if (user.member_type === 'student') {
    return <span className="block"><span className="font-semibold text-amber-700">Belum ada kelas</span><span className="mt-0.5 block text-xs text-slate-500">{user.class_or_position ?? 'Tempatkan lewat halaman Tambah anggota'}</span></span>
  }
  return <span className="block"><span className="font-semibold text-slate-800">{user.class_or_position ?? '-'}</span><span className="mt-0.5 block text-xs text-slate-500">Jabatan</span></span>
}

export function StatCard({ label, value, helper, icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-slate-200 bg-white',
    blue: 'border-blue-100 bg-blue-50',
    emerald: 'border-emerald-100 bg-emerald-50',
  }
  const iconTones = {
    neutral: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  }
  return <article className={`rounded-3xl border p-5 shadow-sm shadow-slate-900/[.02] ${tones[tone]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-black tracking-tight text-navy-950">{value ?? '–'}</p>
      </div>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconTones[tone]}`}><StatIcon name={icon} /></span>
    </div>
    <p className="mt-3 truncate text-[11px] text-slate-500">{helper}</p>
  </article>
}

export function StatIcon({ name }) {
  const paths = {
    users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a4 4 0 0 1 0 7',
    student: 'M3 9l9-4 9 4-9 4-9-4Zm4 6v3c0 1 2.2 2 5 2s5-1 5-2v-3',
    staff: 'M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    check: 'm5 12 4 4L19 6',
    shield: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.users} /></svg>
}
