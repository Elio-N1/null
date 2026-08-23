import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const defaultModel = "gemini-1.5-flash"
const sanitizeModel = (m: string) => m || defaultModel
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
})

const textFromGemini = (payload: Record<string, unknown>) => {
  const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  return candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? ""
}

async function generate(apiKey: string, targetModel: string, body: Record<string, unknown>) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as Record<string, unknown>
  if (!response.ok) {
    const details = payload.error as { message?: string } | undefined
    throw new Error(details?.message ?? `Gemini request failed with status ${response.status}.`)
  }
  const text = textFromGemini(payload)
  if (!text) throw new Error("Gemini returned an empty response.")
  return text
}

const receiptSchema = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING" },
    total: { type: "NUMBER" },
    currency: { type: "STRING", enum: ["USD", "LBP"] },
    date: { type: "STRING", description: "ISO date in YYYY-MM-DD format" },
    category: { type: "STRING" },
    notes: { type: "STRING" },
    confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
    lineItems: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, amount: { type: "NUMBER" } }, required: ["name", "amount"] } },
  },
  required: ["merchant", "total", "currency", "date", "category", "notes", "confidence", "lineItems"],
}

const assistantSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    action: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", enum: ["none", "open_route", "draft_transaction"] },
        route: { type: "STRING" },
        transaction: {
          type: "OBJECT",
          properties: {
            kind: { type: "STRING", enum: ["expense", "income"] }, name: { type: "STRING" },
            amount: { type: "NUMBER" }, currency: { type: "STRING", enum: ["USD", "LBP"] },
            category: { type: "STRING" }, date: { type: "STRING" }, notes: { type: "STRING" },
          },
        },
      },
      required: ["type"],
    },
  },
  required: ["answer", "action"],
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405)

  let input: Record<string, unknown>
  try { input = await request.json() } catch { return json({ error: "Invalid JSON request." }, 400) }

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Sign in to use Gemini." }, 401)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Your session has expired. Sign in again." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: storedKey, error: keyError } = await admin.rpc("get_user_gemini_key", { p_user_id: user.id })
  if (keyError) console.error("gemini-key-read", keyError.message)
  const apiKey = typeof storedKey === "string" ? storedKey.trim() : ""

  const { data: storedModel, error: modelReadErr } = await admin.rpc("get_user_gemini_model", { p_user_id: user.id })
  if (modelReadErr) console.error("gemini-model-read-error:", modelReadErr.message)
  const activeModel = sanitizeModel(typeof storedModel === "string" && storedModel ? storedModel : (input.model ? String(input.model) : defaultModel))

  const mode = String(input.mode ?? "status")

  if (mode === "list_models") {
    const keyToUse = String(input.apiKey ?? "").trim() || apiKey
    if (!keyToUse) return json({ error: "No API key configured or provided." }, 400)
    try {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": keyToUse }
      })
      const payload = await resp.json() as { models?: Array<{ name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }> }
      if (!resp.ok) {
        const details = (payload as { error?: { message?: string } })?.error
        throw new Error(details?.message ?? `Failed to list models (status ${resp.status}).`)
      }
      const rawModels = payload.models ?? []
      const available = rawModels
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => {
          const id = m.name.replace(/^models\//, "")
          return { id, name: m.displayName ?? id, description: m.description ?? "" }
        })
      return json({ models: available, configured: Boolean(apiKey) })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Could not fetch models for this API key." }, 400)
    }
  }

  if (mode === "status") return json({ configured: Boolean(apiKey), model: activeModel, capabilities: ["assistant", "receipt_ocr", "structured_actions"] })

  if (mode === "configure_model") {
    const selectedModel = sanitizeModel(String(input.model ?? defaultModel))
    const { error: saveErr } = await admin.rpc("save_user_gemini_model", { p_user_id: user.id, p_model: selectedModel })
    if (saveErr) {
      console.error("configure_model-error:", saveErr.message)
      return json({ error: `Could not save model: ${saveErr.message}` }, 500)
    }
    return json({ configured: Boolean(apiKey), model: selectedModel, capabilities: ["assistant", "receipt_ocr", "structured_actions"] })
  }

  if (mode === "configure") {
    const candidate = String(input.apiKey ?? "").trim()
    let targetModel = sanitizeModel(String(input.model ?? activeModel))
    if (candidate.length < 20) return json({ error: "Enter a valid Gemini API key." }, 400)
    try {
      try {
        await generate(candidate, targetModel, { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } })
      } catch (firstErr) {
        let verifiedModel = ""
        try {
          const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": candidate } })
          const payload = await resp.json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> }
          if (resp.ok && payload.models) {
            const valid = payload.models
              .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
              .map((m) => m.name.replace(/^models\//, ""))
            verifiedModel = valid[0] ?? ""
          }
        } catch { /* ignore list error */ }

        if (verifiedModel && verifiedModel !== targetModel) {
          try {
            targetModel = verifiedModel
            await generate(candidate, targetModel, { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } })
          } catch {
            throw firstErr
          }
        } else {
          throw firstErr
        }
      }

      const { error } = await admin.rpc("save_user_gemini_key", { p_user_id: user.id, p_api_key: candidate })
      if (error) throw error
      const { error: modelSaveErr } = await admin.rpc("save_user_gemini_model", { p_user_id: user.id, p_model: targetModel })
      if (modelSaveErr) console.error("configure-save-model-error:", modelSaveErr.message)
      return json({ configured: true, model: targetModel, capabilities: ["assistant", "structured_actions"] })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "The Gemini key could not be verified or saved." }, 400)
    }
  }
  if (!apiKey) return json({ error: "Gemini is not configured. Add your API key in Settings → Gemini AI." }, 503)

  try {
    if (mode === "receipt") {
      const image = String(input.image ?? "")
      const mimeType = String(input.mimeType ?? "image/jpeg")
      if (!image || image.length > 9_500_000 || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(mimeType)) return json({ error: "Upload a JPEG, PNG, WebP, HEIC, or HEIF receipt under 7 MB." }, 400)
      const categories = Array.isArray(input.categories) ? input.categories.slice(0, 50).map(String) : []
      const today = new Date().toISOString().slice(0, 10)
      const response = await generate(apiKey, activeModel, {
        systemInstruction: { parts: [{ text: "You extract receipt data conservatively. Never invent values. Use the receipt total, not subtotal. Currency must be USD or LBP. If the year is absent, use the most recent plausible year. Return only schema-compliant JSON." }] },
        contents: [{ role: "user", parts: [
          { text: `Today is ${today}. Extract this receipt. Choose the closest category from: ${categories.join(", ") || "Other"}. Put taxes, payment method, and useful receipt identifiers in notes. Confidence is 0 to 1.` },
          { inlineData: { mimeType, data: image } },
        ] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: receiptSchema, temperature: 0.1 },
      })
      return json({ receipt: JSON.parse(response), model: activeModel })
    }

    if (mode === "assistant") {
      const prompt = String(input.prompt ?? "").trim().slice(0, 2500)
      if (!prompt) return json({ error: "Ask a finance question first." }, 400)
      const context = JSON.stringify(input.context ?? {}).slice(0, 140_000)
      const response = await generate(apiKey, activeModel, {
        systemInstruction: { parts: [{ text: `You are NULL Money's concise personal finance assistant. Answer only from the supplied ledger context. Use exact dates and amounts, distinguish USD and LBP, exclude transfers from income/expense analysis, and say when data is insufficient. For navigation requests use open_route with one of Dashboard, Budget, Transactions, Accounts, Goals, Subscriptions, Reports, Settings. For requests to record money, use draft_transaction; never claim it was saved because the user must review and confirm the form. For all other requests use none. Today is ${new Date().toISOString().slice(0, 10)}.` }] },
        contents: [{ role: "user", parts: [{ text: `FINANCE CONTEXT:\n${context}\n\nUSER REQUEST:\n${prompt}` }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: assistantSchema, temperature: 0.2 },
      })
      return json({ ...JSON.parse(response), model: activeModel })
    }

    return json({ error: "Unsupported Gemini mode." }, 400)
  } catch (error) {
    console.error("gemini-finance", error instanceof Error ? error.message : error)
    return json({ error: error instanceof Error ? error.message : "Gemini request failed." }, 502)
  }
})
