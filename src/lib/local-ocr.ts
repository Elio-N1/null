import type { Currency } from './budget-api'
import type { TransactionDraft } from './gemini'

type LocalReceiptResult = TransactionDraft & { confidence: number; rawText: string }

const cleanAmount = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '')
  if (!normalized) return 0
  const lastDot = normalized.lastIndexOf('.')
  const lastComma = normalized.lastIndexOf(',')
  const decimalIndex = Math.max(lastDot, lastComma)
  const decimalDigits = decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0
  if (decimalDigits === 2) return Number(`${normalized.slice(0, decimalIndex).replace(/[.,]/g, '')}.${normalized.slice(decimalIndex + 1)}`)
  return Number(normalized.replace(/[.,]/g, ''))
}

const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function receiptDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const common = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/)
  if (common) {
    const first = Number(common[1]); const second = Number(common[2])
    const day = first > 12 ? first : second > 12 ? second : first
    const month = first > 12 ? second : second > 12 ? first : second
    const year = common[3].length === 2 ? `20${common[3]}` : common[3]
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return localDate()
}

function receiptAmount(lines: string[]) {
  const amountPattern = /(?:USD|US\$|\$|LBP|L\.?L\.?)?\s*([\d][\d.,\s]{0,18}\d|\d)/gi
  const candidates = lines.flatMap((line, index) => {
    const values = [...line.matchAll(amountPattern)].map((match) => cleanAmount(match[1]))
    const priority = /grand\s*total|amount\s*due|net\s*total/i.test(line) ? 4 : /total/i.test(line) ? 3 : /amount|balance/i.test(line) ? 2 : 0
    return values.filter((value) => Number.isFinite(value) && value > 0).map((value) => ({ value, priority, index }))
  })
  return candidates.sort((a, b) => b.priority - a.priority || b.index - a.index || b.value - a.value)[0]?.value ?? 0
}

function receiptMerchant(lines: string[]) {
  return lines.find((line) => line.length >= 2 && line.length <= 54 && /[a-z]{2}/i.test(line) && !/receipt|invoice|tax|vat|date|cashier|customer|tel|www\.|total/i.test(line)) ?? 'Receipt expense'
}

function closestCategory(text: string, categories: string[]) {
  const rules: Array<[RegExp, string[]]> = [
    [/restaurant|cafe|coffee|food|market|grocery|bakery|carrefour|spinneys/i, ['food', 'dining', 'grocer']],
    [/fuel|gas|petrol|uber|taxi|parking|transport/i, ['transport', 'fuel']],
    [/pharmacy|hospital|clinic|medical/i, ['health', 'medical']],
    [/netflix|spotify|cinema|movie|game/i, ['entertainment']],
    [/electric|water|internet|mobile|telecom|touch|alfa/i, ['utilities', 'utility']],
    [/clothing|fashion|store|shop|mall/i, ['shopping']],
  ]
  for (const [pattern, names] of rules) {
    if (!pattern.test(text)) continue
    const match = categories.find((category) => names.some((name) => category.toLowerCase().includes(name)))
    if (match) return match
  }
  return categories.find((category) => /other|misc/i.test(category)) ?? categories[0] ?? 'Other'
}

export async function recognizeReceiptLocally(canvas: HTMLCanvasElement, categories: string[], onProgress?: (progress: number) => void): Promise<LocalReceiptResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, { logger: (message) => { if (message.status === 'recognizing text') onProgress?.(Math.round((message.progress ?? 0) * 100)) } })
  try {
    const result = await worker.recognize(canvas)
    const rawText = result.data.text.trim()
    const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const currency: Currency = /LBP|L\.?L\.?|LEBANESE|ل\.?ل/i.test(rawText) ? 'LBP' : 'USD'
    const amount = receiptAmount(lines)
    if (!rawText || amount <= 0) throw new Error('The total was not clear. Hold the receipt flat, improve the lighting, and scan again.')
    return {
      kind: 'expense',
      name: receiptMerchant(lines),
      amount,
      currency,
      category: closestCategory(rawText, categories),
      date: receiptDate(rawText),
      notes: 'Scanned locally on this device. Review all fields before saving.',
      confidence: Math.max(0, Math.min(1, result.data.confidence / 100)),
      rawText,
    }
  } finally {
    await worker.terminate()
  }
}
