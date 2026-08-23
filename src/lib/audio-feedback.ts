const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
let sharedAudioContext: AudioContext | null = null

const audioContext = () => {
  const AudioContextClass = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext
  if (!AudioContextClass) return null
  sharedAudioContext ??= new AudioContextClass()
  return sharedAudioContext
}

export const primeAudioFeedback = () => {
  const context = audioContext()
  if (context?.state === 'suspended') void context.resume()
}

export const pcmBase64ToWavUrl = (base64: string, sampleRate = 24_000) => {
  const binary = window.atob(base64)
  const pcm = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) pcm[index] = binary.charCodeAt(index)

  const buffer = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  new Uint8Array(buffer, 44).set(pcm)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

export const playPcmSpeech = async (base64: string, sampleRate = 24_000) => {
  const context = audioContext()
  if (!context) throw new Error('Audio playback is not supported in this browser.')
  if (context.state === 'suspended') await context.resume()
  const binary = window.atob(base64)
  const sampleCount = Math.floor(binary.length / 2)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const pcm = new DataView(bytes.buffer)
  const buffer = context.createBuffer(1, sampleCount, sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index += 1) channel[index] = pcm.getInt16(index * 2, true) / 32_768
  const source = context.createBufferSource()
  const gain = context.createGain()
  gain.gain.value = 0.94
  source.buffer = buffer
  source.connect(gain)
  gain.connect(context.destination)
  let finishPlayback: () => void = () => undefined
  const ended = new Promise<void>((resolve) => { finishPlayback = resolve })
  source.onended = finishPlayback
  source.start()
  return {
    ended,
    stop: () => { try { source.stop() } catch { finishPlayback() } },
  }
}

export const playSuccessChime = () => {
  try {
    const context = audioContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume()
    const master = context.createGain()
    const start = context.currentTime
    master.gain.setValueAtTime(0.0001, start)
    master.gain.exponentialRampToValueAtTime(0.11, start + 0.025)
    master.gain.exponentialRampToValueAtTime(0.0001, start + 0.62)
    master.connect(context.destination)

    ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const noteStart = start + index * 0.075
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.75, noteStart + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.36)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.38)
    })
  } catch { /* Audio feedback is optional when a browser blocks playback. */ }
}
