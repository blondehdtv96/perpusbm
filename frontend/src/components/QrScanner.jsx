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

  return <div className="relative overflow-hidden rounded-2xl bg-slate-950">
    <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
    <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,.3)]" />
    {displayedError && <p className="absolute inset-x-3 bottom-3 rounded-xl bg-red-950/90 p-3 text-sm text-white">{displayedError}</p>}
  </div>
}
