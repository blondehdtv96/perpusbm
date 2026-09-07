import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const statusStyles = {
  available: ['Tersedia', 'bg-emerald-100 text-emerald-700'],
  borrowed: ['Dipinjam', 'bg-amber-100 text-amber-800'],
  overdue: ['Terlambat', 'bg-red-100 text-red-700'],
  maintenance: ['Perawatan', 'bg-blue-100 text-blue-700'],
  lost: ['Hilang', 'bg-slate-200 text-slate-700'],
}

function copyStatus(copy) {
  if (copy.active_loan) {
    return new Date(copy.active_loan.due_at).getTime() < Date.now() ? 'overdue' : 'borrowed'
  }
  return copy.status ?? 'available'
}

function dueDate(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value))
}

export default function CatalogPage() {
  const [books, setBooks] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedBook, setSelectedBook] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current: 1, last: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api('/api/categories')
      .then((response) => { if (!cancelled) setCategories(response.data ?? []) })
      .catch(() => { if (!cancelled) setCategories([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ search, page: String(page) })
      if (categoryId) params.set('category_id', categoryId)
      setLoading(true)
      setError('')
      api(`/api/books?${params}`)
        .then((response) => {
          if (cancelled) return
          setBooks(response.data ?? [])
          setPagination({ current: response.current_page ?? 1, last: response.last_page ?? 1, total: response.total ?? 0 })
        })
        .catch((reason) => {
          if (cancelled) return
          setBooks([])
          setError(reason.message ?? 'Katalog tidak dapat dimuat.')
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [categoryId, page, search])

  useEffect(() => {
    if (!selectedBook) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelectedBook(null) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedBook])

  const changeSearch = (event) => {
    setSearch(event.target.value)
    setPage(1)
  }

  const changeCategory = (event) => {
    setCategoryId(event.target.value)
    setPage(1)
  }

  return <>
    <div><p className="text-sm font-bold text-emerald-700">JELAJAHI KOLEKSI</p><h1 className="mt-1 text-3xl font-black tracking-tight">Katalog buku</h1><p className="mt-2 text-slate-500">Pilih kategori dan buka detail buku untuk melihat nomor inventaris.</p></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
      <label><span className="sr-only">Cari buku</span><input type="search" value={search} onChange={changeSearch} placeholder="Cari judul, penulis, ISBN, atau nomor inventaris…" className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-5 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" /></label>
      <label><span className="sr-only">Pilih kategori</span><select value={categoryId} onChange={changeCategory} className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 font-semibold text-slate-700 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"><option value="">Semua kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.books_count})</option>)}</select></label>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p>}

    <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {loading && [...Array(6)].map((_, index) => <div key={index} className="h-72 animate-pulse rounded-3xl bg-slate-200" />)}
      {!loading && books.map((book) => <article key={book.id} className="flex min-h-72 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
        {book.cover_path ? <img src={`/storage/${book.cover_path}`} alt={`Cover ${book.title}`} className="aspect-[16/7] w-full object-cover" /> : <div className="grid aspect-[16/7] place-items-center bg-gradient-to-br from-emerald-50 to-slate-100 text-4xl" aria-hidden="true">📚</div>}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{book.category?.name ?? 'Umum'}</span><span className="text-xs font-bold text-slate-500">{book.available_copies_count}/{book.copies_count} tersedia</span></div>
          <h2 className="mt-4 text-xl font-black leading-snug">{book.title}</h2><p className="mt-1 text-sm text-slate-500">{book.author}</p><p className="mt-2 text-xs font-semibold text-slate-400">{book.publisher ?? 'Penerbit belum diisi'}</p>
          <button type="button" onClick={() => setSelectedBook(book)} className="mt-auto min-h-11 w-full rounded-xl bg-emerald-700 px-4 pt-0 font-bold text-white hover:bg-emerald-800">Buka detail buku</button>
        </div>
      </article>)}
      {!loading && books.length === 0 && <div className="col-span-full rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">Buku tidak ditemukan.</div>}
    </section>

    {!loading && pagination.last > 1 && <nav aria-label="Navigasi halaman katalog" className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3"><button type="button" disabled={pagination.current <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-10 rounded-xl px-4 text-sm font-bold text-emerald-700 disabled:text-slate-300">Sebelumnya</button><span className="text-center text-sm font-semibold text-slate-500">Halaman {pagination.current} dari {pagination.last} • {pagination.total} buku</span><button type="button" disabled={pagination.current >= pagination.last} onClick={() => setPage((value) => Math.min(pagination.last, value + 1))} className="min-h-10 rounded-xl px-4 text-sm font-bold text-emerald-700 disabled:text-slate-300">Berikutnya</button></nav>}

    {selectedBook && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={() => setSelectedBook(null)}>
      <div role="dialog" aria-modal="true" aria-labelledby="catalog-book-title" className="mx-auto my-4 max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-7"><div><span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{selectedBook.category?.name ?? 'Umum'}</span><h2 id="catalog-book-title" className="mt-3 text-2xl font-black text-slate-950">{selectedBook.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedBook.author} • {selectedBook.publisher ?? 'Penerbit belum diisi'}</p></div><button type="button" onClick={() => setSelectedBook(null)} aria-label="Tutup detail buku" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-600 hover:bg-slate-200">×</button></div>
        <div className="p-5 sm:p-7">
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><p><span className="font-bold text-slate-500">ISBN</span><br />{selectedBook.isbn ?? '-'}</p><p><span className="font-bold text-slate-500">Ketersediaan</span><br />{selectedBook.available_copies_count} dari {selectedBook.copies_count} eksemplar tersedia</p></div>
          {selectedBook.description && <p className="mt-4 text-sm leading-6 text-slate-600">{selectedBook.description}</p>}
          <details className="group mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 font-bold text-slate-800"><span>Nomor seri / inventaris ({selectedBook.copies?.length ?? 0})</span><span className="text-emerald-700 transition group-open:rotate-180">⌄</span></summary>
            <ul className="space-y-2 border-t border-slate-200 p-3 sm:p-4">{selectedBook.copies?.map((copy) => {
              const state = copyStatus(copy)
              const [label, style] = statusStyles[state] ?? [state, 'bg-slate-100 text-slate-700']
              const loan = copy.active_loan
              return <li key={copy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate font-mono text-sm font-bold text-slate-900">{copy.inventory_code}</p><p className="mt-1 text-xs text-slate-500">Rak: {copy.shelf_location ?? '-'}</p>{loan?.user && <p className="mt-1 text-xs font-semibold text-slate-600">Dipinjam oleh {loan.user.name}{loan.user.nis_nip ? ` (${loan.user.nis_nip})` : ''}</p>}{loan?.due_at && <p className={`mt-1 text-xs ${state === 'overdue' ? 'font-bold text-red-600' : 'text-slate-500'}`}>Jatuh tempo {dueDate(loan.due_at)}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>{label}</span></li>
            })}{!selectedBook.copies?.length && <li className="p-5 text-center text-sm text-slate-500">Belum ada eksemplar.</li>}</ul>
          </details>
        </div>
      </div>
    </div>}
  </>
}
