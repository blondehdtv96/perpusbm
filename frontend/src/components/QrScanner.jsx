import { BrowserCodeReader, BrowserQRCodeReader } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

export default function QrScanner({ active, onDetected }) {
  const videoRef = useRef(null)
  const lastScan = useRef({ value: '', time: 0 })
  const [error, setError] = useState('')
  const cameraSupported = globalThis.isSecureContext
    && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)

  useEffect(() => {
    if (!active || !cameraSupported) return undefined
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 })
    let controls
    let cancelled = false

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (!result || cancelled) return
      const value = result.getText()
      const now = Date.now()
      if (lastScan.current.value === value && now - lastScan.current.time < 1800) return
      lastScan.current = { value, time: now }
      navigator.vibrate?.(80)
      onDetected(value)
    }).then((value) => { controls = value }).catch(() => setError('Kamera tidak dapat diakses. Periksa izin browser atau gunakan input manual.'))

    return () => {
      cancelled = true
      controls?.stop()
      BrowserCodeReader.releaseAllStreams()
    }
  }, [active, cameraSupported, onDetected])

  if (!active) return null
  const displayedError = cameraSupported
    ? error
    : 'Kamera memerlukan HTTPS pada HP. Gunakan input manual atau buka aplikasi melalui HTTPS.'

  return <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-xl">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white"><div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /><p className="text-xs font-bold">Kamera aktif</p></div><p className="text-[10px] uppercase tracking-wider text-slate-400">Arahkan QR ke bingkai</p></div>
    <div className="relative"><video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-blue-400 shadow-[0_0_0_999px_rgba(0,0,0,.35)]"><span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-xl border-l-4 border-t-4 border-white" /><span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-white" /></div></div>
    {displayedError ? <p role="alert" className="border-t border-red-900 bg-red-950/80 p-4 text-sm text-red-100">{displayedError}</p> : <p className="px-4 py-3 text-center text-xs text-slate-400">QR akan diproses otomatis setelah terdeteksi.</p>}
  </section>
}
