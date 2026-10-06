import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BusyLabel, EmptyState, Feedback, LoadingOverlay, PageHeader, ProgressBar } from '../components/ui'
import { Avatar, FilterField, PlacementCell, StatCard, StatusBadge } from '../components/members'
import {
  allRoles, errorLines, filterControlClass, memberTypes, optionLabel, percentHelper,
  requestMemberStats, roleLabel, statuses,
} from '../lib/members'
import { api, download } from '../lib/api'
import { useAuth } from '../store/auth'

const emptyFilters = { search: '', member_type: '', status: '', role: '', class_group_id: '' }

export default function MembersPage() {
  const permissions = useAuth((state) => state.permissions)
  const canCreate = permissions.includes('users.create')
  const canUpdate = permissions.includes('users.update')
  const canDelete = permissions.includes('users.delete')
  const [users, setUsers] = useState([])
  const [classes, setClasses] = useState([])
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [rowBusy, setRowBusy] = useState(null)
  const [selected, setSelected] = useState([])
  const [printingCards, setPrintingCards] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const pageIds = users.map((user) => user.id)
  const allPageSelected = users.length > 0 && pageIds.every((id) => selected.includes(id))
  const filtersActive = Object.values(filters).some(Boolean)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    Object.entries(filters).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()) })
    setLoading(true)
    try {
      const response = await api(`/api/users?${params}`)
      setUsers(response.data ?? [])
      setPagination({ current: response.current_page ?? 1, last: response.last_page ?? 1, total: response.total ?? 0 })
    } catch (reason) {
      setUsers([])
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  // Kartu ringkasan memakai hasil hitung ulang dari server, jadi angkanya tidak ikut
  // berubah saat daftar difilter dan tetap sama dengan jumlah baris di basis data.
  const refresh = useCallback(async () => {
    const [, summary] = await Promise.all([load(), requestMemberStats()])
    setStats((current) => summary ?? current)
  }, [load])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    let mounted = true
    requestMemberStats().then((summary) => { if (mounted) { setStats(summary); setStatsLoading(false) } })
    api('/api/users/form-options', { silent: true })
      .then((response) => { if (mounted) setClasses(response.data?.classes ?? []) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  const changeFilter = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(emptyFilters)
    setPage(1)
  }

  // Status diubah lewat endpoint khusus, jadi penempatan kelas dan password tidak pernah ikut terkirim.
  const toggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    setRowBusy({ id: user.id, action: 'status' })
    setError('')
    try {
      await api(`/api/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) })
      setMessage(`Status ${user.name} berhasil diubah menjadi ${optionLabel(statuses, nextStatus).toLowerCase()}.`)
      await refresh()
    } catch (reason) { setError(errorLines(reason)) } finally { setRowBusy(null) }
  }

  const printCards = async () => {
    if (!selected.length) return
    const count = selected.length
    setPrintingCards(true)
    setError('')
    try {
      await download('/api/users/cards/print', { method: 'POST', body: JSON.stringify({ ids: selected }) })
      setMessage(`${count} kartu anggota berhasil dibuat.`)
    } catch (reason) { setError(reason.message) } finally { setPrintingCards(false) }
  }

  const toggleUser = (id, checked) => {
    setError('')
    if (!checked) {
      setSelected((items) => items.filter((item) => item !== id))
      return
    }
    if (selected.includes(id)) return
    if (selected.length >= 100) {
      setError('Maksimal 100 anggota dapat dipilih untuk sekali cetak.')
      return
    }
    setSelected((items) => [...items, id])
  }

  const togglePage = (checked) => {
    setError('')
    if (!checked) {
      setSelected((items) => items.filter((id) => !pageIds.includes(id)))
      return
    }
    const newIds = pageIds.filter((id) => !selected.includes(id))
    if (selected.length + newIds.length > 100) {
      setError('Pilihan dibatasi maksimal 100 anggota. Batalkan sebagian pilihan terlebih dahulu.')
      return
    }
    setSelected((items) => [...items, ...newIds])
  }

  const remove = async (user) => {
    if (!confirm(`Hapus ${user.name}?`)) return
    setRowBusy({ id: user.id, action: 'delete' })
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      setSelected((items) => items.filter((id) => id !== user.id))
      setMessage(`${user.name} berhasil dihapus.`)
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setRowBusy(null) }
  }

  const removeSelected = async () => {
    if (!selected.length) return
    if (!confirm(`Hapus ${selected.length} anggota terpilih? Tindakan ini tidak dapat dibatalkan.`)) return
    setBulkDeleting(true)
    setError('')
    try {
      const response = await api('/api/users/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) })
      const deleted = response.data?.deleted ?? []
      const skipped = response.data?.skipped ?? []
      setSelected(skipped.map((item) => item.id))
      setMessage(`${deleted.length} anggota berhasil dihapus${skipped.length ? `, ${skipped.length} dilewati` : ''}.`)
      if (skipped.length) setError(skipped.map((item) => `${item.name}: ${item.reason}`).join(' '))
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setBulkDeleting(false) }
  }

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Administrasi"
      title="Daftar Anggota"
      description="Cari, filter, dan kelola seluruh akun anggota perpustakaan beserta penempatan kelasnya."
      actions={canCreate && <Link to="/users" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800">+ Tambah anggota</Link>}
    />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{Array.isArray(error) ? <ul className="list-disc space-y-1 pl-5">{error.map((line, index) => <li key={index}>{line}</li>)}</ul> : error}</Feedback>}

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan jumlah anggota">
      {statsLoading && !stats
        ? [...Array(4)].map((_, index) => <div key={index} className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white p-5" />)
        : <>
          <StatCard tone="blue" icon="users" label="Total anggota terdaftar" value={stats?.total} helper="Seluruh akun anggota aktif di basis data" />
          <StatCard icon="student" label="Siswa" value={stats?.students} helper={stats?.unplaced_students ? `${stats.unplaced_students} siswa belum punya kelas` : percentHelper(stats?.students, stats?.total)} />
          <StatCard icon="staff" label="Guru / Staf" value={stats?.staff} helper={percentHelper(stats?.staff, stats?.total)} />
          <StatCard tone="emerald" icon="check" label="Anggota aktif" value={stats?.active} helper={`${stats?.suspended ?? 0} ditangguhkan • ${stats?.inactive ?? 0} tidak aktif`} />
        </>}
    </section>

    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <LoadingOverlay show={Boolean(rowBusy) || bulkDeleting || printingCards} label={printingCards ? 'Menyiapkan kartu anggota…' : 'Memperbarui data anggota…'} />
      <div className="border-b border-slate-200 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><h2 className="text-xl font-black text-navy-950">Daftar anggota</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{pagination.total} hasil pencarian</span></div><p className="mt-1 text-sm text-slate-500">Pilih beberapa anggota untuk mencetak kartu atau menghapusnya sekaligus.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={() => togglePage(!allPageSelected)} disabled={users.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">{allPageSelected ? 'Batalkan halaman' : 'Pilih halaman ini'}</button><button type="button" onClick={printCards} disabled={selected.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={printingCards} busyText="Membuat PDF…">{`Cetak kartu (${selected.length})`}</BusyLabel></button></div></div></div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem_12rem] sm:p-5">
        <FilterField label="Pencarian" className="sm:col-span-2 lg:col-span-1">
          <input type="search" value={filters.search} onChange={changeFilter('search')} placeholder="Nama, username, atau NIS/NIP" className={filterControlClass} />
        </FilterField>
        <FilterField label="Tipe anggota">
          <select value={filters.member_type} onChange={changeFilter('member_type')} className={filterControlClass}><option value="">Semua tipe</option>{memberTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </FilterField>
        <FilterField label="Role">
          <select value={filters.role} onChange={changeFilter('role')} className={filterControlClass}><option value="">Semua role</option>{allRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </FilterField>
        <FilterField label="Status">
          <select value={filters.status} onChange={changeFilter('status')} className={filterControlClass}><option value="">Semua status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </FilterField>
        <FilterField label="Kelas">
          <select value={filters.class_group_id} onChange={changeFilter('class_group_id')} className={filterControlClass}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select>
        </FilterField>
      </div>

      {selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm sm:px-5"><div><p className="font-bold text-blue-900">{selected.length} anggota dipilih</p><p className="text-xs text-blue-700">Maksimal 100 anggota dalam sekali cetak atau hapus.</p></div><div className="flex flex-wrap gap-2">{canDelete && <button type="button" onClick={removeSelected} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl border border-red-200 bg-white px-3 font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={bulkDeleting} busyText="Menghapus…">{`Hapus semua (${selected.length})`}</BusyLabel></button>}<button type="button" onClick={() => setSelected([])} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl px-3 font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Batalkan pilihan</button></div></div>}

      <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-5 py-4"><input type="checkbox" aria-label="Pilih semua anggota pada halaman ini" checked={allPageSelected} disabled={users.length === 0 || loading || printingCards || bulkDeleting} onChange={(event) => togglePage(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></th><th className="px-3 py-4">Anggota</th><th className="px-3 py-4">Identitas</th><th className="px-3 py-4">Penempatan</th><th className="px-3 py-4">Status</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && [...Array(5)].map((_, index) => <tr key={index}><td colSpan="6" className="px-5 py-3"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></td></tr>)}{!loading && users.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="px-5 py-4"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></td><td className="px-3 py-4"><div className="flex items-center gap-3"><Avatar user={user} className="h-10 w-10" /><div><p className="font-bold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{optionLabel(memberTypes, user.member_type)} • {roleLabel(user.role ?? user.roles?.[0]?.name)}{user.gender_label ? ` • ${user.gender_label}` : ''}</p></div></div></td><td className="px-3 py-4"><p className="font-mono text-xs font-bold">@{user.username}</p><p className="mt-1 text-xs text-slate-500">{user.nis_nip ?? 'NIS/NIP belum diisi'}</p><p className="text-xs text-slate-400">{user.member_number ?? 'Nomor anggota belum ada'}</p>{user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}</td><td className="px-3 py-4"><PlacementCell user={user} /></td><td className="px-3 py-4"><StatusBadge status={user.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></td></tr>)}</tbody></table></div>

      <div className="divide-y divide-slate-100 md:hidden">{loading && [...Array(4)].map((_, index) => <div key={index} className="p-4"><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /></div>)}{!loading && users.map((user) => <article key={user.id} className="p-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="mt-2 h-6 w-6 shrink-0 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /><Avatar user={user} className="h-11 w-11" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{user.name}</p><StatusBadge status={user.status} /></div><p className="mt-0.5 truncate text-sm text-slate-500">@{user.username}</p><div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><p><span className="text-slate-500">NIS/NIP</span><br /><span className="font-bold">{user.nis_nip ?? '-'}</span></p><p><span className="text-slate-500">No. anggota</span><br /><span className="font-bold">{user.member_number ?? '-'}</span></p><p><span className="text-slate-500">Tipe</span><br /><span className="font-bold">{optionLabel(memberTypes, user.member_type)}</span></p><p><span className="text-slate-500">Role</span><br /><span className="font-bold">{roleLabel(user.role ?? user.roles?.[0]?.name)}</span></p><p><span className="text-slate-500">Jenis kelamin</span><br /><span className="font-bold">{user.gender_label ?? '-'}</span></p><p><span className="text-slate-500">No. HP</span><br /><span className="font-bold">{user.phone ?? '-'}</span></p><p className="col-span-2"><span className="text-slate-500">Penempatan</span><br /><PlacementCell user={user} /></p></div><div className="mt-3 flex gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-10 flex-1 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-10 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></div></div></div></article>)}</div>

      {!loading && users.length === 0 && <div className="p-5 sm:p-6"><EmptyState icon="♙" title="Anggota tidak ditemukan" description={filtersActive ? 'Ubah kata pencarian atau filter yang digunakan.' : 'Belum ada anggota terdaftar. Tambahkan lewat halaman Tambah anggota.'} />{filtersActive && <div className="mt-4 text-center"><button type="button" onClick={resetFilters} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Bersihkan filter</button></div>}</div>}
      {loading && users.length === 0 && <div className="px-5 pb-5 sm:px-6"><ProgressBar label="Memuat daftar anggota…" /></div>}
      {!loading && pagination.last > 1 && <nav aria-label="Navigasi halaman anggota" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6"><button type="button" disabled={pagination.current <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Sebelumnya</button><p className="text-center text-xs font-semibold text-slate-500 sm:text-sm">Halaman {pagination.current} dari {pagination.last}</p><button type="button" disabled={pagination.current >= pagination.last} onClick={() => setPage((value) => Math.min(pagination.last, value + 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Berikutnya</button></nav>}
    </section>
  </div>
}
