import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CloseSquare, Image2, Scan } from 'react-iconly'
import type { Category } from '../lib/budget-api'
import type { TransactionDraft } from '../lib/gemini'
import { recognizeReceiptLocally } from '../lib/local-ocr'

type Props = { categories: Category[]; onClose: () => void; onExtracted: (draft: TransactionDraft) => void }

const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop())

function enhanceReceipt(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = pixels.data[index] * .299 + pixels.data[index + 1] * .587 + pixels.data[index + 2] * .114
    const value = Math.max(0, Math.min(255, (gray - 128) * 1.28 + 128))
    pixels.data[index] = value; pixels.data[index + 1] = value; pixels.data[index + 2] = value
  }
  context.putImageData(pixels, 0, 0)
}

export default function ReceiptScannerModal({ categories, onClose, onExtracted }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    setError(''); setCameraReady(false); stopStream(streamRef.current)
    if (!navigator.mediaDevices?.getUserMedia) return setError('Live camera access requires HTTPS or localhost. You can choose an image instead.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraReady(true) }
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError'
      setError(denied ? 'Camera permission was not granted. Allow it in browser settings or choose a receipt image.' : 'The camera could not be opened. Choose a receipt image instead.')
    }
  }, [])

  useEffect(() => { void startCamera(); return () => stopStream(streamRef.current) }, [startCamera])

  const readCanvas = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setReading(true); setProgress(0); setError('')
    try {
      const result = await recognizeReceiptLocally(canvas, categories.filter((item) => item.active).map((item) => item.name), setProgress)
      onExtracted(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The receipt could not be read locally.')
    } finally { setReading(false) }
  }

  const capture = async () => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return setError('Wait for the camera to focus, then try again.')
    const scale = Math.min(1, 1800 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    enhanceReceipt(canvas); stopStream(streamRef.current); streamRef.current = null; setCameraReady(false)
    await readCanvas()
  }

  const chooseImage = async (file?: File) => {
    if (!file) return
    if (file.size > 10_000_000) return setError('Choose an image smaller than 10 MB.')
    const image = new Image(); const url = URL.createObjectURL(file); image.src = url
    try {
      await image.decode(); const canvas = canvasRef.current
      if (!canvas) return
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height); enhanceReceipt(canvas)
      stopStream(streamRef.current); streamRef.current = null; setCameraReady(false); await readCanvas()
    } finally { URL.revokeObjectURL(url) }
  }

  return <div className="modal-backdrop receipt-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="glass modal receipt-scanner live-receipt-scanner" role="dialog" aria-modal="true" aria-label="Scan a receipt locally">
      <div className="modal-title"><div><span className="signal-dot" />LOCAL RECEIPT SCANNER</div><button onClick={onClose} aria-label="Close"><CloseSquare set="curved" /></button></div>
      <div className={`live-camera ${cameraReady ? 'ready' : ''} ${reading ? 'reading' : ''}`}>
        <video ref={videoRef} muted playsInline aria-label="Live rear camera preview" />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="receipt-frame" aria-hidden="true"><i /><i /><i /><i /></div>
        {!cameraReady && !reading ? <div className="camera-wait"><span><Camera set="curved" size={30} /></span><strong>OPENING REAR CAMERA</strong><small>Camera access stays on this device.</small></div> : null}
        {reading ? <div className="local-ocr-progress"><Scan set="curved" size={31} /><strong>READING ON DEVICE</strong><span><i style={{ width: `${Math.max(4, progress)}%` }} /></span><small>{progress}% · No image is uploaded or saved</small></div> : null}
      </div>
      <div className="camera-guidance"><i /><span><strong>ALIGN THE RECEIPT INSIDE THE FRAME</strong><small>Hold it flat and steady with the total clearly visible.</small></span></div>
      <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />
      <div className="receipt-actions camera-actions">
        <button onClick={() => inputRef.current?.click()} disabled={reading}><Image2 set="curved" size={20} />CHOOSE IMAGE</button>
        <button className="receipt-analyze" disabled={!cameraReady || reading} onClick={() => void capture()}><Camera set="curved" size={20} />{reading ? 'READING…' : 'SCAN NOW'}</button>
      </div>
      {error ? <div className="form-error camera-error" role="alert"><span>{error}</span><button onClick={() => void startCamera()}>TRY CAMERA AGAIN</button></div> : null}
      <div className="receipt-privacy"><i /><span><strong>PRIVATE ON-DEVICE OCR</strong><small>The scanner samples one frame in memory, extracts text locally, then discards it. You review the resulting expense before saving.</small></span></div>
    </section>
  </div>
}
