import { useCallback, useEffect, useRef, useState } from 'react'
import { BusyLabel, EmptyState, Feedback, LoadingOverlay, PageHeader, ProgressBar } from '../components/ui'
import { api, download } from '../lib/api'
import { useAuth } from '../store/auth'

const initialForm = { name: '', username: '', password: '', nis_nip: '', member_type: 'student', role: 'student', class_or_position: '', status: 'active' }
const memberTypes = [['student', 'Siswa'], ['staff', 'Staf']]
const statuses = [['active', 'Aktif'], ['suspended', 'Ditangguhkan'], ['inactive', 'Tidak aktif']]
const statusStyles = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-800',
  inactive: 'bg-slate-200 text-slate-700',
}

function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] ?? value
}

// Error validasi (422) membawa pesan per field; tampilkan semuanya, bukan hanya ringkasan "…and 1 more error".
function errorLines(reason) {
  const lines = Object.values(reason?.errors ?? {}).flat().filter(Boolean)
  return lines.length > 0 ? lines : (reason?.message ?? 'Terjadi kesalahan.')
}

async function requestStats() {
  try {
    const response = await api('/api/users/stats')
    return response.data ?? null
  } catch {
    return null
  }
}

function roleLabel(role) {
  return ({ student: 'Siswa', staff: 'Staf', librarian: 'Pustakawan', super_admin: 'Super Admin' })[role] ?? role
}

export default function UsersPage() {
  const permissions = useAuth((state) => state.permissions)
  const canCreate = permissions.includes('users.create')
  const canUpdate = permissions.includes('users.update')
  const canDelete = permissions.includes('users.delete')
  const fileInputRef = useRef(null)
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [memberType, setMemberType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(initialForm)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const [selected, setSelected] = useState([])
  const [printingCards, setPrintingCards] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const pageIds = users.map((user) => user.id)
  const allPageSelected = users.length > 0 && pageIds.every((id) => selected.includes(id))

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    if (search.trim()) params.set('search', search.trim())
    if (memberType) params.set('member_type', memberType)
    if (status) params.set('status', status)
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
  }, [memberType, page, search, status])

  // Kartu ringkasan memakai hasil hitung ulang dari server, jadi angkanya tidak ikut
  // berubah saat daftar difilter dan tetap sama dengan jumlah baris di basis data.
  const refresh = useCallback(async () => {
    const [, summary] = await Promise.all([load(), requestStats()])
    setStats((current) => summary ?? current)
  }, [load])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    let mounted = true
    requestStats().then((summary) => { if (mounted) { setStats(summary); setStatsLoading(false) } })
    return () => { mounted = false }
  }, [])

  const create = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    setFormErrors({})
    try {
      const response = await api('/api/users', { method: 'POST', body: JSON.stringify(form) })
      setForm(initialForm)
      setMessage(response?.message ?? 'Anggota berhasil ditambahkan.')
      await refresh()
    } catch (reason) {
      setFormErrors(reason.errors ?? {})
      setError(errorLines(reason))
    } finally { setBusy(false) }
  }

  const selectImportFile = (file) => {
    setImportResult(null)
    setError('')
    if (!file) {
      setImportFile(null)
      return
    }
    if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
      setImportFile(null)
      setError('Format file harus CSV, TXT, XLSX, atau XLS.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportFile(null)
      setError('Ukuran file maksimal 5 MB.')
      return
    }
    setImportFile(file)
  }

  const importUsers = async () => {
    if (!importFile) return
    const body = new FormData()
    body.append('file', importFile)
    setBusy(true)
    setError('')
    setImportResult(null)
    setImportProgress({ percent: 0, phase: 'upload' })
    try {
      const response = await api('/api/imports/users', {
        method: 'POST',
        body,
        onProgress: (percent, phase) => setImportProgress(phase === 'done' ? { percent: 100, phase: 'processing' } : { percent, phase }),
      })
      setImportResult(response.data)
      setMessage(`Impor selesai: ${response.data.success_rows} anggota baru, ${response.data.updated_rows ?? 0} diperbarui, dan ${response.data.failed_rows} gagal.`)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setBusy(false); setImportProgress(null) }
  }

  const downloadTemplate = async () => {
    setDownloadingTemplate(true)
    setError('')
    try {
      await download('/api/imports/users/template')
      setMessage('Template XLSX berhasil diunduh.')
    } catch (reason) { setError(reason.message) } finally { setDownloadingTemplate(false) }
  }

  const toggleStatus = async (user) => {
    const role = user.roles?.[0]?.name ?? user.member_type
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    setRowBusy({ id: user.id, action: 'status' })
    setError('')
    try {
      await api(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: user.name,
          username: user.username,
          password: '',
          nis_nip: user.nis_nip,
          member_type: user.member_type,
          class_or_position: user.class_or_position,
          status: nextStatus,
          role,
        }),
      })
      setMessage(`Status ${user.name} berhasil diubah menjadi ${optionLabel(statuses, nextStatus).toLowerCase()}.`)
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setRowBusy(null) }
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
      const { deleted, skipped } = response.data
      setSelected(skipped.map((item) => item.id))
      if (deleted.length) setMessage(`${deleted.length} anggota berhasil dihapus.${skipped.length ? ` ${skipped.length} anggota dilewati.` : ''}`)
      if (skipped.length) setError(skipped.map((item) => `${item.name}: ${item.reason}`).join(' '))
      await refresh()
    } catch (reason) { setError(reason.message) } finally { setBulkDeleting(false) }
  }

  const resetPage = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Administrasi" title="Anggota" description="Kelola akun, status, dan impor data anggota dengan lebih mudah." />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{Array.isArray(error) ? <ul className="list-disc space-y-1 pl-5">{error.map((line, index) => <li key={index}>{line}</li>)}</ul> : error}</Feedback>}

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan jumlah anggota">
      {statsLoading && !stats
        ? [...Array(4)].map((_, index) => <div key={index} className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white p-5" />)
        : <>
          <StatCard tone="blue" icon="users" label="Total anggota terdaftar" value={stats?.total} helper="Seluruh akun anggota aktif di basis data" />
          <StatCard icon="student" label="Siswa" value={stats?.students} helper={percentHelper(stats?.students, stats?.total)} />
          <StatCard icon="staff" label="Staf" value={stats?.staff} helper={percentHelper(stats?.staff, stats?.total)} />
          <StatCard tone="emerald" icon="check" label="Anggota aktif" value={stats?.active} helper={`${stats?.suspended ?? 0} ditangguhkan • ${stats?.inactive ?? 0} tidak aktif`} />
        </>}
    </section>

    {canCreate && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div><h2 className="text-lg font-black text-navy-950">Tambah anggota</h2><p className="mt-1 text-sm text-slate-500">Tambahkan satu anggota secara manual.</p></div><form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nama" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required error={formErrors.name?.[0]} />
        <Field label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value.replace(/\s+/g, '') })} required minLength="3" hint="Huruf, angka, titik, garis bawah, dan strip. Tanpa spasi." error={formErrors.username?.[0]} />
        <Field label="NIS/NIP" value={form.nis_nip} onChange={(value) => setForm({ ...form, nis_nip: value })} hint="Boleh dikosongkan bila belum ada." error={formErrors.nis_nip?.[0]} />
        <Field label="Kelas/Jabatan" value={form.class_or_position} onChange={(value) => setForm({ ...form, class_or_position: value })} error={formErrors.class_or_position?.[0]} />
        <Select label="Tipe" value={form.member_type} onChange={(value) => setForm({ ...form, member_type: value, role: value })} options={memberTypes} />
        <Select label="Role" value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={[['student', 'Siswa'], ['staff', 'Staf'], ['librarian', 'Pustakawan'], ['super_admin', 'Super Admin']]} />
        <Field label="Password awal" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} required minLength="8" hint="Minimal 8 karakter." error={formErrors.password?.[0]} />
        <button disabled={busy} className="min-h-11 self-end rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800 disabled:opacity-60"><BusyLabel busy={busy} busyText="Menyimpan…">Simpan anggota</BusyLabel></button>
      </form></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-navy-950">Import anggota</h2><p className="mt-1 text-sm text-slate-500">Gunakan template agar data langsung sesuai format.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">XLSX</span></div>
        <ol className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500"><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">1</span>Unduh</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">2</span>Isi data</li><li className="rounded-xl bg-slate-50 p-2"><span className="block text-base text-blue-700">3</span>Unggah</li></ol>
        <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate || busy} className="mt-4 min-h-11 w-full rounded-xl border border-blue-700 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><BusyLabel busy={downloadingTemplate} busyText="Mengunduh…">↓ Unduh template XLSX</BusyLabel></button>
        <div role="button" tabIndex="0" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click() }} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectImportFile(event.dataTransfer.files?.[0]) }} className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400'}`}><div className="text-2xl text-blue-700" aria-hidden="true">⇧</div><p className="mt-2 text-sm font-bold">Tarik file ke sini atau klik untuk memilih</p><p className="mt-1 text-xs text-slate-500">CSV, XLSX, atau XLS • Maksimal 5 MB</p><input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(event) => selectImportFile(event.target.files?.[0])} className="sr-only" /></div>
        {importFile && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-navy-950">{importFile.name}</p><p className="text-xs text-blue-700">{(importFile.size / 1024).toFixed(1)} KB • Siap diunggah</p></div><button type="button" onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="shrink-0 text-xs font-bold text-red-600">Hapus</button></div>}
        <button type="button" onClick={importUsers} disabled={!importFile || busy} className="mt-3 min-h-11 w-full rounded-xl bg-navy-950 px-4 text-sm font-bold text-white hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={Boolean(importProgress)} busyText="Mengimpor data…">Mulai import</BusyLabel></button>
        {importProgress && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          {importProgress.phase === 'upload'
            ? <ProgressBar value={importProgress.percent} label="Mengunggah file" hint="Jangan tutup halaman ini sampai proses selesai." />
            : <ProgressBar label="Memproses baris data di server…" hint="Semakin banyak baris, semakin lama prosesnya. Mohon tunggu." />}
        </div>}
      </section>
    </div>}

    {importResult && <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Hasil import</h2><p className="text-sm text-slate-500">{importResult.filename}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Selesai</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black">{importResult.total_rows}</p><p className="text-xs text-slate-500">Total baris</p></div><div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-2xl font-black text-emerald-700">{importResult.success_rows}</p><p className="text-xs text-emerald-700">Anggota baru</p></div><div className="rounded-2xl bg-blue-50 p-4 text-center"><p className="text-2xl font-black text-blue-700">{importResult.updated_rows ?? 0}</p><p className="text-xs text-blue-700">Diperbarui</p></div><div className="rounded-2xl bg-red-50 p-4 text-center"><p className="text-2xl font-black text-red-700">{importResult.failed_rows}</p><p className="text-xs text-red-700">Gagal</p></div></div>{importResult.notes?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-blue-200"><summary className="cursor-pointer bg-blue-50 px-4 py-3 font-bold text-blue-800">Lihat catatan penyesuaian data ({importResult.notes.length})</summary><div className="max-h-72 divide-y divide-blue-100 overflow-y-auto">{importResult.notes.map((note, index) => <div key={index} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {note.row_number}{note.username ? ` • ${note.username}` : ''}</p><p className="mt-1 text-slate-600">{note.message}</p></div>)}</div></details>}{importResult.failures?.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-red-200"><summary className="cursor-pointer bg-red-50 px-4 py-3 font-bold text-red-800">Lihat baris yang gagal ({importResult.failures.length})</summary><div className="max-h-72 divide-y divide-red-100 overflow-y-auto">{importResult.failures.map((failure) => <div key={failure.id} className="p-4 text-sm"><p className="font-bold text-slate-900">Baris {failure.row_number}: {failure.row_data?.name ?? failure.row_data?.username ?? 'Data tidak valid'}</p><ul className="mt-1 list-disc pl-5 text-red-700">{Object.values(failure.errors ?? {}).flat().map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div></details>}</section>}

    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><LoadingOverlay show={Boolean(rowBusy) || bulkDeleting || printingCards} label={printingCards ? 'Menyiapkan kartu anggota…' : 'Memperbarui data anggota…'} /><div className="border-b border-slate-200 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><h2 className="text-xl font-black text-navy-950">Daftar anggota</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{pagination.total} hasil pencarian</span></div><p className="mt-1 text-sm text-slate-500">Cari dan kelola akun anggota perpustakaan.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={() => togglePage(!allPageSelected)} disabled={users.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">{allPageSelected ? 'Batalkan halaman' : 'Pilih halaman ini'}</button><button type="button" onClick={printCards} disabled={selected.length === 0 || loading || printingCards || bulkDeleting} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={printingCards} busyText="Membuat PDF…">{`Cetak kartu (${selected.length})`}</BusyLabel></button></div></div></div>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem] sm:p-5"><label className="sm:col-span-2 lg:col-span-1"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Pencarian</span><input type="search" value={search} onChange={resetPage(setSearch)} placeholder="Nama, username, atau NIS/NIP" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Tipe anggota</span><select value={memberType} onChange={resetPage(setMemberType)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua tipe</option>{memberTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span><select value={status} onChange={resetPage(setStatus)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>

      {selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm sm:px-5"><div><p className="font-bold text-blue-900">{selected.length} anggota dipilih</p><p className="text-xs text-blue-700">Maksimal 100 anggota dalam sekali cetak atau hapus.</p></div><div className="flex flex-wrap gap-2">{canDelete && <button type="button" onClick={removeSelected} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl border border-red-200 bg-white px-3 font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><BusyLabel busy={bulkDeleting} busyText="Menghapus…">{`Hapus semua (${selected.length})`}</BusyLabel></button>}<button type="button" onClick={() => setSelected([])} disabled={printingCards || bulkDeleting} className="min-h-10 rounded-xl px-3 font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40">Batalkan pilihan</button></div></div>}

      <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-5 py-4"><input type="checkbox" aria-label="Pilih semua anggota pada halaman ini" checked={allPageSelected} disabled={users.length === 0 || loading || printingCards || bulkDeleting} onChange={(event) => togglePage(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></th><th className="px-3 py-4">Anggota</th><th className="px-3 py-4">Identitas</th><th className="px-3 py-4">Tipe & role</th><th className="px-3 py-4">Status</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && [...Array(5)].map((_, index) => <tr key={index}><td colSpan="6" className="px-5 py-3"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></td></tr>)}{!loading && users.map((user) => { const role = user.roles?.[0]?.name ?? user.member_type; return <tr key={user.id} className="hover:bg-slate-50"><td className="px-5 py-4"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /></td><td className="px-3 py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-800">{user.name.charAt(0).toUpperCase()}</div><div><p className="font-bold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">@{user.username}</p></div></div></td><td className="px-3 py-4"><p className="font-mono text-xs font-bold">@{user.username}</p><p className="mt-1 text-xs text-slate-500">{user.nis_nip ?? 'NIS/NIP belum diisi'}</p></td><td className="px-3 py-4"><p className="font-semibold">{optionLabel(memberTypes, user.member_type)}</p><p className="text-xs text-slate-500">{roleLabel(role)} • {user.class_or_position ?? '-'}</p></td><td className="px-3 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[user.status] ?? 'bg-slate-100 text-slate-700'}`}>{optionLabel(statuses, user.status)}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></td></tr> })}</tbody></table></div>

      <div className="divide-y divide-slate-100 md:hidden">{loading && [...Array(4)].map((_, index) => <div key={index} className="p-4"><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /></div>)}{!loading && users.map((user) => { const role = user.roles?.[0]?.name ?? user.member_type; return <article key={user.id} className="p-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Pilih ${user.name}`} checked={selected.includes(user.id)} disabled={printingCards || bulkDeleting} onChange={(event) => toggleUser(user.id, event.target.checked)} className="mt-2 h-6 w-6 shrink-0 rounded border-slate-300 accent-blue-700 disabled:opacity-40" /><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-800">{user.name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{user.name}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[user.status] ?? 'bg-slate-100 text-slate-700'}`}>{optionLabel(statuses, user.status)}</span></div><p className="mt-0.5 truncate text-sm text-slate-500">@{user.username}</p><div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><p><span className="text-slate-500">Username</span><br /><span className="font-mono font-bold">@{user.username}</span></p><p><span className="text-slate-500">NIS/NIP</span><br /><span className="font-bold">{user.nis_nip ?? '-'}</span></p><p><span className="text-slate-500">Tipe</span><br /><span className="font-bold">{optionLabel(memberTypes, user.member_type)}</span></p><p><span className="text-slate-500">Role</span><br /><span className="font-bold">{roleLabel(role)}</span></p></div><div className="mt-3 flex gap-2">{canUpdate && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => toggleStatus(user)} className="min-h-10 flex-1 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-700 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'status'} busyText="Menyimpan…" spinnerSize={13}>{user.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</BusyLabel></button>}{canDelete && <button type="button" disabled={rowBusy?.id === user.id} onClick={() => remove(user)} className="min-h-10 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-600 disabled:opacity-40"><BusyLabel busy={rowBusy?.id === user.id && rowBusy.action === 'delete'} busyText="Menghapus…" spinnerSize={13}>Hapus</BusyLabel></button>}</div></div></div></div></article> })}</div>

      {!loading && users.length === 0 && <div className="p-5 sm:p-6"><EmptyState icon="♙" title="Anggota tidak ditemukan" description="Ubah kata pencarian atau filter yang digunakan." /></div>}
      {!loading && pagination.last > 1 && <nav aria-label="Navigasi halaman anggota" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6"><button type="button" disabled={pagination.current <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Sebelumnya</button><p className="text-center text-xs font-semibold text-slate-500 sm:text-sm">Halaman {pagination.current} dari {pagination.last}</p><button type="button" disabled={pagination.current >= pagination.last} onClick={() => setPage((value) => Math.min(pagination.last, value + 1))} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-40 sm:px-4">Berikutnya</button></nav>}
    </section>
  </div>
}

function percentHelper(part, total) {
  if (!total || part === undefined || part === null) return 'Belum ada data'
  return `${Math.round((part / total) * 100)}% dari total anggota`
}

function StatCard({ label, value, helper, icon, tone = 'neutral' }) {
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

function StatIcon({ name }) {
  const paths = {
    users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a4 4 0 0 1 0 7',
    student: 'M3 9l9-4 9 4-9 4-9-4Zm4 6v3c0 1 2.2 2 5 2s5-1 5-2v-3',
    staff: 'M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    check: 'm5 12 4 4L19 6',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.users} /></svg>
}

function Field({ label, value, onChange, type = 'text', required = false, minLength, hint, error }) {
  return <label className="text-sm font-bold">{label}
    <input type={type} value={value} required={required} minLength={minLength} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 min-h-11 w-full rounded-xl border px-3 font-normal outline-none focus:ring-4 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'}`} />
    {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </label>
}

function Select({ label, value, onChange, options }) {
  return <label className="text-sm font-bold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">{options.map(([itemValue, itemLabel]) => <option key={itemValue} value={itemValue}>{itemLabel}</option>)}</select></label>
}
