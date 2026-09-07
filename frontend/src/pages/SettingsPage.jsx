import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function SettingsPage() {
  const permissions = useAuth((state) => state.permissions)
  const [policies, setPolicies] = useState([])
  const [roles, setRoles] = useState([])
  const [allPermissions, setAllPermissions] = useState([])
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const policyResponse = await api('/api/settings/loan-policies'); setPolicies(policyResponse.data ?? [])
      if (permissions.includes('roles.manage')) { const roleResponse = await api('/api/roles-permissions'); setRoles(roleResponse.data.roles); setAllPermissions(roleResponse.data.permissions) }
    } catch (reason) { setError(reason.message) }
  }, [permissions])
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer) }, [load])
  const savePolicy = async (policy) => { try { await api(`/api/settings/loan-policies/${policy.id}`, { method: 'PUT', body: JSON.stringify(policy) }); load() } catch (reason) { setError(reason.message) } }
  const togglePermission = async (role, name) => { const current = role.permissions.map((item) => item.name); const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name]; try { await api(`/api/roles/${role.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: next }) }); load() } catch (reason) { setError(reason.message) } }
  return <>
    <div><p className="text-sm font-bold text-emerald-700">KONFIGURASI</p><h1 className="mt-1 text-3xl font-black">Pengaturan</h1><p className="mt-2 text-slate-500">Aturan peminjaman dan matriks permission.</p></div>{error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="mt-6 grid gap-4 md:grid-cols-2">{policies.map((policy, index) => <article key={policy.id} className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-black capitalize">{policy.member_type}</h2><div className="mt-4 grid grid-cols-2 gap-3">{[['max_books', 'Maks. buku'], ['loan_days', 'Durasi (hari)'], ['fine_per_day', 'Denda/hari'], ['fine_block_threshold', 'Ambang blokir']].map(([field, label]) => <label key={field} className="text-xs font-bold text-slate-500">{label}<input type="number" value={policy[field]} disabled={!permissions.includes('settings.manage')} onChange={(e) => setPolicies((items) => items.map((item, position) => position === index ? { ...item, [field]: Number(e.target.value) } : item))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 disabled:bg-slate-100" /></label>)}</div>{permissions.includes('settings.manage') && <button onClick={() => savePolicy(policy)} className="mt-4 min-h-11 w-full rounded-xl bg-emerald-700 font-bold text-white">Simpan</button>}</article>)}</section>
    {permissions.includes('roles.manage') && <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-black">Role & permission</h2><div className="mt-4 space-y-5">{roles.map((role) => <div key={role.id}><p className="mb-2 font-black capitalize">{role.name.replace('_', ' ')}</p><div className="flex flex-wrap gap-2">{allPermissions.map((permission) => { const active = role.permissions.some((item) => item.name === permission.name); return <button key={permission.id} disabled={role.name === 'super_admin'} onClick={() => togglePermission(role, permission.name)} className={`rounded-full px-3 py-2 text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{permission.name}</button> })}</div></div>)}</div></section>}
  </>
}
