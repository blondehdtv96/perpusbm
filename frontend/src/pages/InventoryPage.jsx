import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Feedback, PageHeader } from '../components/ui'
import { api, download } from '../lib/api'
import { useAuth } from '../store/auth'

const statusOptions = [
  ['available', 'Tersedia'],
  ['borrowed', 'Dipinjam'],
  ['maintenance', 'Perawatan'],
  ['lost', 'Hilang'],
]

const statusStyles = {
  available: 'bg-emerald-100 text-emerald-700',
  borrowed: 'bg-amber-100 text-amber-800',
  maintenance: 'bg-blue-100 text-blue-700',
  lost: 'bg-slate-200 text-slate-700',
}

function statusLabel(status) {
  return statusOptions.find(([value]) => value === status)?.[1] ?? status
}

export default function InventoryPage() {
  const permissions = useAuth((state) => state.permissions)
  const canUpdate = permissions.includes('catalog.update')
  const [categories, setCategories] = useState([])
  const [books, setBooks] = useState([])
  const [copies, setCopies] = useState([])
  const [selected, setSelected] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [book, setBook] = useState({ title: '', author: '', publisher: '', isbn: '', book_category_id: '', copies: 1, shelf_location: '' })
  const [cover, setCover] = useState(null)
  const [copySearch, setCopySearch] = useState('')
  const [copyBookId, setCopyBookId] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [copyPage, setCopyPage] = useState(1)
  const [copyPagination, setCopyPagination] = useState({ current: 1, last: 1, total: 0 })
  const [copyLoading, setCopyLoading] = useState(true)
  const [editingCopy, setEditingCopy] = useState(null)
  const [editForm, setEditForm] = useState({ inventory_code: '', shelf_location: '', status: 'available', condition_notes: '' })
  const [savingCopy, setSavingCopy] = useState(false)
  const [editError, setEditError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadReferences = useCallback(async () => {
    try {
      const [categoryResponse, bookResponse] = await Promise.all([api('/api/categories'), api('/api/books?per_page=100')])
      setCategories(categoryResponse.data ?? [])
      setBooks(bookResponse.data ?? [])
    } catch (reason) {
      setError(reason.message)
    }
  }, [])

  const loadCopies = useCallback(async () => {
    const params = new URLSearchParams({ page: String(copyPage), per_page: '20' })
    if (copySearch.trim()) params.set('search', copySearch.trim())
    if (copyBookId) params.set('book_id', copyBookId)
    if (copyStatus) params.set('status', copyStatus)
    setCopyLoading(true)
    try {
      const response = await api(`/api/book-copies?${params}`)
      setCopies(response.data ?? [])
      setCopyPagination({ current: response.current_page ?? 1, last: response.last_page ?? 1, total: response.total ?? 0 })
    } catch (reason) {
      setCopies([])
      setError(reason.message)
    } finally {
      setCopyLoading(false)
    }
  }, [copyBookId, copyPage, copySearch, copyStatus])

  useEffect(() => {
    const timer = setTimeout(loadReferences, 0)
    return () => clearTimeout(timer)
  }, [loadReferences])

  useEffect(() => {
    const timer = setTimeout(loadCopies, 250)
    return () => clearTimeout(timer)
  }, [loadCopies])

  useEffect(() => {
    if (!editingCopy) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !savingCopy) setEditingCopy(null) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [editingCopy, savingCopy])

  const refresh = () => {
    loadReferences()
    loadCopies()
  }

  const createCategory = async (event) => {
    event.preventDefault()
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name: categoryName }) })
      setCategoryName('')
      setMessage('Kategori berhasil ditambahkan.')
      loadReferences()
    } catch (reason) { setError(reason.message) }
  }

  const createBook = async (event) => {
    event.preventDefault()
    try {
      const body = new FormData()
      Object.entries(book).forEach(([key, value]) => body.append(key, value))
      if (cover) body.append('cover', cover)
      await api('/api/books', { method: 'POST', body })
      setBook({ title: '', author: '', publisher: '', isbn: '', book_category_id: '', copies: 1, shelf_location: '' })
      setCover(null)
      setMessage('Buku dan eksemplarnya berhasil ditambahkan.')
      refresh()
    } catch (reason) { setError(reason.message) }
  }

  const removeBook = async (item) => {
    if (!confirm(`Hapus ${item.title}?`)) return
    try {
      await api(`/api/books/${item.id}`, { method: 'DELETE' })
      setMessage('Judul buku berhasil dihapus.')
      refresh()
    } catch (reason) { setError(reason.message) }
  }

  const openEdit = (copy) => {
    setEditingCopy(copy)
    setEditForm({
      inventory_code: copy.inventory_code,
      shelf_location: copy.shelf_location ?? '',
      status: copy.status,
      condition_notes: copy.condition_notes ?? '',
    })
    setEditError('')
  }

  const saveCopy = async (event) => {
    event.preventDefault()
    setSavingCopy(true)
    setEditError('')
    const payload = {
      inventory_code: editForm.inventory_code.trim(),
      shelf_location: editForm.shelf_location.trim() || null,
      condition_notes: editForm.condition_notes.trim() || null,
    }
    if (editingCopy.status !== 'borrowed') payload.status = editForm.status
    try {
      await api(`/api/book-copies/${editingCopy.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      setEditingCopy(null)
      setMessage(`Eksemplar ${payload.inventory_code} berhasil diperbarui.`)
      loadCopies()
    } catch (reason) {
      setEditError(reason.message)
    } finally {
      setSavingCopy(false)
    }
  }

  const toggleCopy = (id, checked) => {
    setSelected((items) => checked
      ? [...new Set([...items, id])].slice(0, 100)
      : items.filter((item) => item !== id))
  }

  const allPageSelected = copies.length > 0 && copies.every((copy) => selected.includes(copy.id))
  const togglePage = (checked) => {
    const pageIds = copies.map((copy) => copy.id)
    setSelected((items) => checked
      ? [...new Set([...items, ...pageIds])].slice(0, 100)
      : items.filter((id) => !pageIds.includes(id)))
  }

  const labels = async () => {
    if (!selected.length) return
    setError('')
    try {
      await download('/api/book-copies/labels', { method: 'POST', body: JSON.stringify({ ids: selected }) })
      setMessage(`${selected.length} label berhasil dibuat.`)
    } catch (reason) { setError(reason.message) }
  }

  const resetCopyPage = (setter) => (event) => {
    setter(event.target.value)
    setCopyPage(1)
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Koleksi" title="Inventaris" description="Kelola kategori, judul, eksemplar, dan label QR." />
    {message && <Feedback type="success">{message}</Feedback>}
    {error && <Feedback type="error">{error}</Feedback>}
    <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-black text-navy-950">Kategori</h2><form onSubmit={createCategory} className="mt-3 flex gap-2"><input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3" placeholder="Nama kategori" /><button className="rounded-xl bg-navy-950 px-4 font-bold text-white hover:bg-navy-900">Tambah</button></form><div className="mt-4 flex flex-wrap gap-2">{categories.map((item) => <span key={item.id} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold">{item.name} ({item.books_count})</span>)}</div></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-black text-navy-950">Tambah buku</h2><form onSubmit={createBook} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['title', 'author', 'publisher', 'isbn', 'shelf_location'].map((field) => <input key={field} required={['title', 'author'].includes(field)} value={book[field]} onChange={(e) => setBook({ ...book, [field]: e.target.value })} className="min-h-11 rounded-xl border border-slate-300 px-3" placeholder={field.replace('_', ' ')} />)}<select value={book.book_category_id} onChange={(e) => setBook({ ...book, book_category_id: e.target.value })} className="min-h-11 rounded-xl border border-slate-300 px-3"><option value="">Tanpa kategori</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="number" min="0" max="100" value={book.copies} onChange={(e) => setBook({ ...book, copies: e.target.value })} className="min-h-11 rounded-xl border border-slate-300 px-3" placeholder="Jumlah eksemplar" /><label className="flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-300 px-3 text-sm text-slate-500">{cover ? cover.name : 'Pilih cover'}<input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className="sr-only" /></label><button className="min-h-11 rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800">Simpan buku</button></form></section>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-black text-navy-950">Judul buku</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{books.map((item) => <article key={item.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-black">{item.title}</p><p className="text-sm text-slate-500">{item.author}</p><p className="mt-3 text-xs font-bold text-emerald-700">{item.available_copies_count}/{item.copies_count} tersedia</p><button onClick={() => removeBook(item)} className="mt-3 text-xs font-bold text-red-600">Hapus judul</button></article>)}</div></section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><div className="flex items-center gap-3"><h2 className="text-xl font-black text-navy-950">Eksemplar</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{copyPagination.total} data</span></div><p className="mt-1 text-sm text-slate-500">Cari, filter, edit, lalu pilih eksemplar untuk mencetak label QR.</p></div>{canUpdate && <button type="button" onClick={labels} disabled={!selected.length} className="min-h-11 shrink-0 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Cetak label ({selected.length})</button>}</div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_11rem] sm:p-5">
        <label className="sm:col-span-2 lg:col-span-1"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Cari kode</span><input type="search" value={copySearch} onChange={resetCopyPage(setCopySearch)} placeholder="Contoh: BK-000001-001" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label>
        <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Judul buku</span><select value={copyBookId} onChange={resetCopyPage(setCopyBookId)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua buku</option>{books.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span><select value={copyStatus} onChange={resetCopyPage(setCopyStatus)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">Semua status</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      {selected.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 text-sm"><p className="font-bold text-blue-800">{selected.length} eksemplar dipilih</p><button type="button" onClick={() => setSelected([])} className="font-bold text-blue-700 hover:text-blue-900">Batalkan pilihan</button></div>}

      <div className="hidden md:block">
        <table className="w-full text-left text-sm"><thead className="bg-white text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-14 px-5 py-4"><input type="checkbox" aria-label="Pilih semua eksemplar pada halaman ini" checked={allPageSelected} onChange={(event) => togglePage(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700" /></th><th className="px-3 py-4">Kode inventaris</th><th className="px-3 py-4">Buku</th><th className="px-3 py-4">Status</th><th className="px-3 py-4">Lokasi rak</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">
          {copyLoading && [...Array(5)].map((_, index) => <tr key={index}><td colSpan="6" className="px-5 py-3"><div className="h-12 animate-pulse rounded-xl bg-slate-100" /></td></tr>)}
          {!copyLoading && copies.map((copy) => <tr key={copy.id} className="transition hover:bg-slate-50"><td className="px-5 py-4"><input type="checkbox" aria-label={`Pilih ${copy.inventory_code}`} checked={selected.includes(copy.id)} onChange={(event) => toggleCopy(copy.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-700" /></td><td className="px-3 py-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-700">{copy.inventory_code}</span></td><td className="px-3 py-4"><p className="font-bold text-slate-900">{copy.book?.title}</p><p className="mt-0.5 text-xs text-slate-500">{copy.book?.author}</p></td><td className="px-3 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusStyles[copy.status] ?? 'bg-slate-100 text-slate-700'}`}>{statusLabel(copy.status)}</span></td><td className="px-3 py-4 font-semibold text-slate-600">{copy.shelf_location ?? '-'}</td><td className="px-5 py-4 text-right">{canUpdate ? <button type="button" onClick={() => openEdit(copy)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-blue-600 hover:text-blue-700">Edit</button> : <span className="text-slate-400">—</span>}</td></tr>)}
        </tbody></table>
      </div>

      <div className="divide-y divide-slate-100 md:hidden">
        {copyLoading && [...Array(4)].map((_, index) => <div key={index} className="p-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>)}
        {!copyLoading && copies.map((copy) => <article key={copy.id} className="p-4"><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Pilih ${copy.inventory_code}`} checked={selected.includes(copy.id)} onChange={(event) => toggleCopy(copy.id, event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 accent-blue-700" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate font-mono text-sm font-black text-slate-900">{copy.inventory_code}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[copy.status] ?? 'bg-slate-100 text-slate-700'}`}>{statusLabel(copy.status)}</span></div><p className="mt-3 font-bold text-slate-900">{copy.book?.title}</p><p className="text-xs text-slate-500">{copy.book?.author}</p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Lokasi rak <span className="font-bold text-slate-700">{copy.shelf_location ?? '-'}</span></p>{canUpdate && <button type="button" onClick={() => openEdit(copy)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold text-blue-700">Edit</button>}</div></div></div></div></article>)}
      </div>

      {!copyLoading && copies.length === 0 && <div className="p-5 sm:p-6"><EmptyState icon="▦" title="Eksemplar tidak ditemukan" description="Ubah kata pencarian atau filter yang digunakan." /></div>}

      {!copyLoading && copyPagination.last > 1 && <nav aria-label="Navigasi halaman eksemplar" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6"><button type="button" disabled={copyPagination.current <= 1} onClick={() => setCopyPage((value) => Math.max(1, value - 1))} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-40">Sebelumnya</button><p className="text-center text-xs font-semibold text-slate-500 sm:text-sm">Halaman {copyPagination.current} dari {copyPagination.last}</p><button type="button" disabled={copyPagination.current >= copyPagination.last} onClick={() => setCopyPage((value) => Math.min(copyPagination.last, value + 1))} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-40">Berikutnya</button></nav>}
    </section>

    {editingCopy && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={() => { if (!savingCopy) setEditingCopy(null) }}><div role="dialog" aria-modal="true" aria-labelledby="edit-copy-title" className="mx-auto my-4 max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">Kelola eksemplar</p><h2 id="edit-copy-title" className="mt-1 text-2xl font-black text-navy-950">Edit eksemplar</h2><p className="mt-1 text-sm text-slate-500">{editingCopy.book?.title}</p></div><button type="button" disabled={savingCopy} onClick={() => setEditingCopy(null)} aria-label="Tutup modal edit" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-600 disabled:opacity-40">×</button></div><form onSubmit={saveCopy} className="space-y-4 p-5 sm:p-6">{editError && <Feedback type="error">{editError}</Feedback>}<label className="block text-sm font-bold text-slate-700">Kode inventaris<input required maxLength="100" value={editForm.inventory_code} onChange={(event) => setEditForm({ ...editForm, inventory_code: event.target.value })} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-mono outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-700">Lokasi rak<input maxLength="100" value={editForm.shelf_location} onChange={(event) => setEditForm({ ...editForm, shelf_location: event.target.value })} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><label className="block text-sm font-bold text-slate-700">Status<select disabled={editingCopy.status === 'borrowed'} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100">{editingCopy.status === 'borrowed' && <option value="borrowed">Dipinjam</option>}{statusOptions.filter(([value]) => value !== 'borrowed').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{editingCopy.status === 'borrowed' && <Feedback type="warning">Status dipinjam hanya dapat berubah melalui proses pengembalian.</Feedback>}<label className="block text-sm font-bold text-slate-700">Catatan kondisi<textarea rows="3" value={editForm.condition_notes} onChange={(event) => setEditForm({ ...editForm, condition_notes: event.target.value })} placeholder="Contoh: Sampul sedikit terlipat" className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label><div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={savingCopy} onClick={() => setEditingCopy(null)} className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold text-slate-700 disabled:opacity-40">Batal</button><button disabled={savingCopy} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-60">{savingCopy ? 'Menyimpan…' : 'Simpan perubahan'}</button></div></form></div></div>}
  </div>
}
