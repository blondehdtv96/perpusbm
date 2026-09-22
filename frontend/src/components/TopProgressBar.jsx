import { useEffect, useRef, useState } from 'react'
import { subscribeToApiActivity } from '../lib/api'

// Progress bar tipis di bagian paling atas layar. Tampil otomatis selama ada permintaan ke server
// (simpan, ubah, hapus, import, unduh) lalu menutup sendiri setelah semuanya selesai.
export default function TopProgressBar() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const trickle = useRef(null)
  const hide = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const stopTimers = () => {
      clearInterval(trickle.current)
      clearTimeout(hide.current)
      trickle.current = null
      hide.current = null
    }

    const unsubscribe = subscribeToApiActivity((active) => {
      if (active > 0) {
        clearTimeout(hide.current)
        hide.current = null
        started.current = true
        setVisible(true)
        setProgress((value) => (value === 0 || value >= 100 ? 12 : value))
        if (!trickle.current) {
          // Durasi request tidak diketahui, jadi bar merambat mendekati 90% lalu menunggu respons.
          trickle.current = setInterval(() => setProgress((value) => (value >= 90 ? 90 : value + Math.max(1, (90 - value) / 9))), 220)
        }

        return
      }

      if (!trickle.current && !started.current) return
      clearInterval(trickle.current)
      trickle.current = null
      started.current = false
      setProgress(100)
      hide.current = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 320)
    })

    return () => {
      unsubscribe()
      stopTimers()
    }
  }, [])

  return <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
    <div className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-red-500 shadow-[0_0_10px_rgb(21_94_239/.7)] transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
  </div>
}
