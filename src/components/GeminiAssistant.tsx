import { useMemo, useRef, useState } from 'react'
import { Chat, CloseSquare, Send, Voice, VolumeOff, VolumeUp } from 'react-iconly'
import { askGemini, type FinanceAssistantContext, type GeminiAction, type TransactionDraft } from '../lib/gemini'

type Message = { id: number; role: 'user' | 'assistant'; text: string; action?: GeminiAction }
type Props = { context: FinanceAssistantContext; onClose: () => void; onNavigate: (route: string) => void; onDraft: (draft: TransactionDraft) => void; onOpenSettings: () => void }

type SpeechRecognitionInstance = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

const suggestions = ['What were my largest expenses last week?', 'How much did I save this month?', 'Show my upcoming subscriptions']
const voiceKey = 'null-money:gemini-voice'

export default function GeminiAssistant({ context, onClose, onNavigate, onDraft, onOpenSettings }: Props) {
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: 'assistant', text: 'Ask about your spending, budgets, goals, or subscriptions. I can also prepare actions for you to review.' }])
  const [activeModel, setActiveModel] = useState('GEMINI AI')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem(voiceKey) !== 'off')
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const speechRecognition = useMemo(() => (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition, [])

  const speak = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text); utterance.rate = .97; utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }

  const ask = async (question = input) => {
    const prompt = question.trim(); if (!prompt || busy) return
    const userMessage: Message = { id: Date.now(), role: 'user', text: prompt }
    const conversation = [...messages.slice(-6), userMessage].map((item) => `${item.role.toUpperCase()}: ${item.text}`).join('\n')
    setMessages((current) => [...current, userMessage]); setInput(''); setBusy(true); setError('')
    try {
      const result = await askGemini(conversation, context)
      if (result.model) setActiveModel(result.model.toUpperCase())
      const next: Message = { id: Date.now() + 1, role: 'assistant', text: result.answer, action: result.action }
      setMessages((current) => [...current, next]); speak(result.answer)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gemini could not answer right now.') }
    finally { setBusy(false) }
  }

  const listen = () => {
    if (!speechRecognition) return setError('Voice input is not supported in this browser.')
    if (listening) { recognitionRef.current?.stop(); return }
    const recognition = new speechRecognition(); recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript ?? ''; setInput(transcript) }
    recognition.onerror = () => { setListening(false); setError('I could not hear that clearly. Please try again.') }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition; setListening(true); setError(''); recognition.start()
  }

  const runAction = (action: GeminiAction) => {
    if (action.type === 'open_route' && action.route) { onNavigate(action.route); onClose() }
    if (action.type === 'draft_transaction' && action.transaction) { onDraft(action.transaction); onClose() }
  }

  const toggleVoice = () => { const next = !voiceEnabled; setVoiceEnabled(next); localStorage.setItem(voiceKey, next ? 'on' : 'off'); if (!next) window.speechSynthesis?.cancel() }

  return <div className="assistant-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="gemini-assistant glass" role="dialog" aria-modal="true" aria-label="Gemini finance assistant">
      <header><div><span><i />{activeModel}</span><h2>ASK NULL</h2></div><div><button onClick={toggleVoice} aria-label={voiceEnabled ? 'Turn spoken answers off' : 'Turn spoken answers on'}>{voiceEnabled ? <VolumeUp set="curved" /> : <VolumeOff set="curved" />}</button><button onClick={onClose} aria-label="Close assistant"><CloseSquare set="curved" /></button></div></header>
      <div className="assistant-messages" aria-live="polite">
        {messages.map((message) => <article className={message.role} key={message.id}><span>{message.role === 'assistant' ? <Chat set="curved" size={17} /> : 'YOU'}</span><p>{message.text}</p>{message.action && message.action.type !== 'none' ? <button className="assistant-action" onClick={() => runAction(message.action!)}>{message.action.type === 'open_route' ? `OPEN ${message.action.route?.toUpperCase()}` : 'REVIEW TRANSACTION DRAFT'} <b>→</b></button> : null}</article>)}
        {busy ? <article className="assistant thinking"><span><Chat set="curved" size={17} /></span><p>Reviewing your ledger<span className="thinking-dots">•••</span></p></article> : null}
      </div>
      {messages.length === 1 ? <div className="assistant-suggestions">{suggestions.map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}</div> : null}
      {error ? <div className="assistant-error" role="alert"><span>{error}</span><button onClick={onOpenSettings}>OPEN SETTINGS</button></div> : null}
      <div className="assistant-composer"><button className={listening ? 'listening' : ''} onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak a question'}><Voice set="curved" /></button><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} placeholder={listening ? 'Listening…' : 'Ask about your money…'} rows={1} /><button className="assistant-send" disabled={!input.trim() || busy} onClick={() => void ask()} aria-label="Send question"><Send set="curved" /></button></div>
      <footer><i />VOICE ANSWERS {voiceEnabled ? 'ON' : 'OFF'}<span>Actions always require your confirmation.</span></footer>
    </section>
  </div>
}
