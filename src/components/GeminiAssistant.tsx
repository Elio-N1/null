import { useEffect, useMemo, useRef, useState } from 'react'
import { Chat, CloseSquare, Send, Voice, VolumeOff, VolumeUp } from 'react-iconly'
import { playPcmSpeech, primeAudioFeedback } from '../lib/audio-feedback'
import { askGemini, generateGeminiSpeech, type FinanceAssistantContext, type GeminiAction, type TransactionDraft } from '../lib/gemini'

type Message = { id: number; role: 'user' | 'assistant'; text: string; action?: GeminiAction }
type Props = { context: FinanceAssistantContext; conversationScope: string; previewTransactions: boolean; onClose: () => void; onNavigate: (route: string) => void; onDraft: (draft: TransactionDraft) => void; onCreateTransaction: (draft: TransactionDraft) => Promise<void>; onOpenSettings: () => void }
type StoredConversation = { version: 1; expiresAt: number; messages: Message[] }

type SpeechRecognitionResult = { 0: { transcript: string }; isFinal?: boolean }
type SpeechRecognitionInstance = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null; onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null }
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

const suggestions = ['What were my largest expenses last week?', 'How much did I save this month?', 'Show my upcoming subscriptions']
const voiceKey = 'null-money:gemini-voice'
const conversationLifetime = 24 * 60 * 60 * 1000
const greeting: Message = { id: 1, role: 'assistant', text: 'Ask about your spending, budgets, goals, or subscriptions. I can also create complete transactions for you.' }
const freshConversation = (): StoredConversation => ({ version: 1, expiresAt: Date.now() + conversationLifetime, messages: [greeting] })

const readConversation = (scope: string): StoredConversation => {
  try {
    const key = `null-money:gemini-conversation:${scope}`
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as StoredConversation | null
    if (parsed?.version === 1 && parsed.expiresAt > Date.now() && Array.isArray(parsed.messages) && parsed.messages.length) return parsed
    localStorage.removeItem(key)
  } catch { /* conversation persistence is optional */ }
  return freshConversation()
}

const missingTransactionDetails = (draft: TransactionDraft, context: FinanceAssistantContext) => {
  const missing: string[] = []
  if (!draft.name?.trim()) missing.push('a transaction name')
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) missing.push('a positive amount')
  if (draft.currency !== 'USD' && draft.currency !== 'LBP') missing.push('USD or LBP currency')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date ?? '')) missing.push('a valid date')
  if (!draft.category?.trim()) missing.push('a category')
  if (!Number.isInteger(draft.accountId) || !context.accounts.some((account) => account.id === draft.accountId && account.active)) missing.push('an active account')
  if (draft.kind === 'expense' && !context.categories.some((category) => category.active && category.name.toLowerCase() === draft.category.toLowerCase())) missing.push('an active expense category')
  return [...new Set(missing)]
}

const withPrimaryAccount = (draft: TransactionDraft, context: FinanceAssistantContext): TransactionDraft => {
  if (Number.isInteger(draft.accountId)) return draft
  const primary = context.accounts.find((account) => account.active && account.primary) ?? context.accounts.find((account) => account.active)
  return primary ? { ...draft, accountId: primary.id } : draft
}

export default function GeminiAssistant({ context, conversationScope, previewTransactions, onClose, onNavigate, onDraft, onCreateTransaction, onOpenSettings }: Props) {
  const storageKey = `null-money:gemini-conversation:${conversationScope}`
  const [conversation, setConversation] = useState<StoredConversation>(() => readConversation(conversationScope))
  const messages = conversation.messages
  const [activeModel, setActiveModel] = useState('GEMINI AI')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem(voiceKey) !== 'off')
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const transcriptRef = useRef('')
  const recognitionFailedRef = useRef(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const stopAnswerAudioRef = useRef<(() => void) | null>(null)
  const speechRequestRef = useRef(0)
  const voiceEnabledRef = useRef(voiceEnabled)
  const speechRecognition = useMemo(() => (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition, [])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(conversation)) } catch { /* conversation persistence is optional */ }
    const remaining = Math.max(0, conversation.expiresAt - Date.now())
    const timer = window.setTimeout(() => setConversation(freshConversation()), remaining)
    return () => window.clearTimeout(timer)
  }, [conversation, storageKey])

  useEffect(() => { voiceEnabledRef.current = voiceEnabled }, [voiceEnabled])

  useEffect(() => {
    const container = messagesRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages.length, busy])

  const stopSpokenAnswer = () => {
    speechRequestRef.current += 1
    stopAnswerAudioRef.current?.()
    stopAnswerAudioRef.current = null
  }

  useEffect(() => () => { recognitionRef.current?.stop(); stopSpokenAnswer() }, [])

  const appendMessage = (message: Message) => setConversation((current) => ({ ...current, messages: [...current.messages, message] }))

  const speak = async (text: string) => {
    if (!voiceEnabled) return
    stopSpokenAnswer()
    const requestId = speechRequestRef.current
    try {
      const speech = await generateGeminiSpeech(text.slice(0, 2500))
      if (!voiceEnabledRef.current || requestId !== speechRequestRef.current) return
      stopAnswerAudioRef.current = await playPcmSpeech(speech.audio, speech.sampleRate)
    } catch { /* The written answer remains available when audio generation or playback fails. */ }
  }

  const ask = async (question = input) => {
    const prompt = question.trim(); if (!prompt || busy) return
    primeAudioFeedback()
    const userMessage: Message = { id: Date.now(), role: 'user', text: prompt }
    const conversation = [...messages.slice(-6), userMessage].map((item) => `${item.role.toUpperCase()}: ${item.text}`).join('\n')
    appendMessage(userMessage); setInput(''); setBusy(true); setError('')
    try {
      const result = await askGemini(conversation, context)
      if (result.model) setActiveModel(result.model.toUpperCase())
      let next: Message = { id: Date.now() + 1, role: 'assistant', text: result.answer, action: result.action }
      if (!previewTransactions && result.action.type === 'draft_transaction' && result.action.transaction) {
        const resolvedDraft = withPrimaryAccount(result.action.transaction, context)
        const missing = missingTransactionDetails(resolvedDraft, context)
        if (missing.length) {
          next = { ...next, text: `I still need ${missing.join(', ')} before I can create that transaction.`, action: { type: 'none' } }
        } else {
          await onCreateTransaction(resolvedDraft)
          const draft = resolvedDraft
          const formattedAmount = draft.currency === 'USD' ? `$${draft.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${draft.amount.toLocaleString('en-US')} LBP`
          next = { ...next, text: `${draft.kind === 'expense' ? 'Expense' : 'Income'} created: ${draft.name} · ${formattedAmount}.`, action: { type: 'none' } }
        }
      }
      appendMessage(next); void speak(next.text)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gemini could not answer right now.') }
    finally { setBusy(false) }
  }

  const listen = () => {
    if (!speechRecognition) return setError('Voice input is not supported in this browser.')
    if (listening) { recognitionRef.current?.stop(); return }
    const recognition = new speechRecognition(); recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = false
    transcriptRef.current = ''; recognitionFailedRef.current = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim()
      transcriptRef.current = transcript; setInput(transcript)
    }
    recognition.onerror = (event) => {
      recognitionFailedRef.current = true; setListening(false)
      if (event.error !== 'aborted') setError(event.error === 'no-speech' ? 'I did not hear anything. Tap the microphone and try again.' : 'I could not hear that clearly. Please try again.')
    }
    recognition.onend = () => {
      recognitionRef.current = null; setListening(false)
      const transcript = transcriptRef.current.trim()
      if (!recognitionFailedRef.current && transcript) { setInput(''); void ask(transcript) }
    }
    recognitionRef.current = recognition; setListening(true); setError(''); recognition.start()
  }

  const runAction = (action: GeminiAction) => {
    if (action.type === 'open_route' && action.route) { onNavigate(action.route); onClose() }
    if (action.type === 'draft_transaction' && action.transaction) { onDraft(action.transaction); onClose() }
  }

  const toggleVoice = () => { const next = !voiceEnabled; setVoiceEnabled(next); localStorage.setItem(voiceKey, next ? 'on' : 'off'); if (!next) stopSpokenAnswer() }

  return <div className="assistant-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="gemini-assistant glass" role="dialog" aria-modal="true" aria-label="Gemini finance assistant">
      <header><div className="assistant-identity"><span><i />{activeModel}</span><h2>ASK NULL</h2><small>YOUR FINANCE COPILOT</small></div><div><button onClick={toggleVoice} aria-label={voiceEnabled ? 'Turn spoken answers off' : 'Turn spoken answers on'}>{voiceEnabled ? <VolumeUp set="curved" /> : <VolumeOff set="curved" />}</button><button onClick={onClose} aria-label="Close assistant"><CloseSquare set="curved" /></button></div></header>
      <div className="assistant-messages" ref={messagesRef} aria-live="polite">
        {messages.map((message) => <article className={message.role} key={message.id}><span>{message.role === 'assistant' ? <Chat set="curved" size={17} /> : 'YOU'}</span><p>{message.text}</p>{message.action && message.action.type !== 'none' ? <button className="assistant-action" onClick={() => runAction(message.action!)}>{message.action.type === 'open_route' ? `OPEN ${message.action.route?.toUpperCase()}` : 'REVIEW TRANSACTION DRAFT'} <b>→</b></button> : null}</article>)}
        {busy ? <article className="assistant thinking"><span><Chat set="curved" size={17} /></span><p>Reviewing your ledger<span className="thinking-dots">•••</span></p></article> : null}
      </div>
      {messages.length === 1 ? <div className="assistant-suggestions">{suggestions.map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}</div> : null}
      {error ? <div className="assistant-error" role="alert"><span>{error}</span><button onClick={onOpenSettings}>OPEN SETTINGS</button></div> : null}
      {listening ? <div className="assistant-voice-state"><span><i /><i /><i /></span><strong>LISTENING</strong><small>Pause naturally when you are done — I’ll send it automatically.</small></div> : null}
      <div className="assistant-composer"><button className={listening ? 'listening' : ''} disabled={busy} onClick={listen} aria-label={listening ? 'Finish speaking' : 'Speak a question'}><Voice set="curved" /></button><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} placeholder={listening ? 'Listening — pause to send…' : 'Ask about your money…'} rows={1} /><button className="assistant-send" disabled={!input.trim() || busy || listening} onClick={() => void ask()} aria-label="Send question"><Send set="curved" /></button></div>
      <footer><i />VOICE ANSWERS {voiceEnabled ? 'ON' : 'OFF'}<span>{previewTransactions ? 'Transactions open for review.' : 'Complete transactions post directly.'}</span></footer>
    </section>
  </div>
}
