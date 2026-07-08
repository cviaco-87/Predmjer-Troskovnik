import { proveriAutentikaciju } from './_authCheck.js'

// ── OSNOVNI RATE LIMITING (u memoriji servera) ──
// Napomena: ovo je jednostavna, "najbolji-mogući" zaštita koja radi unutar jedne
// pokrenute instance servera. Vercel serverless funkcije mogu povremeno pokrenuti
// novu instancu (hladni start), pri čemu se ovo brojanje resetuje na nulu. Za punu,
// pouzdanu zaštitu preko svih instanci trebao bi vanjski servis (npr. Upstash Redis),
// ali ovo već znatno otežava zloupotrebu u odnosu na potpuno otvoren endpoint.
const zahtjeviPoKorisniku = new Map() // userId -> [timestamp, timestamp, ...]
const MAX_ZAHTJEVA_PO_SATU = 30

function jeLimitPredjen(userId) {
  const sada = Date.now()
  const jedanSat = 60 * 60 * 1000
  const postojeci = (zahtjeviPoKorisniku.get(userId) || []).filter(t => sada - t < jedanSat)
  if (postojeci.length >= MAX_ZAHTJEVA_PO_SATU) {
    zahtjeviPoKorisniku.set(userId, postojeci)
    return true
  }
  postojeci.push(sada)
  zahtjeviPoKorisniku.set(userId, postojeci)
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── PROVJERA PRIJAVE — bez ovoga bilo ko na internetu može trošiti Anthropic budžet ──
  const auth = await proveriAutentikaciju(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  // ── RATE LIMITING — sprečava da jedan korisnik (ili neko ko mu ukrade token) potroši sav budžet ──
  if (jeLimitPredjen(auth.userId)) {
    return res.status(429).json({ error: 'Previše zahtjeva. Molimo pokušajte ponovo za nekoliko minuta.' })
  }

  try {
    const { system, messages, webSearch = false } = req.body

    const body = {
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      system,
      messages
    }

    // Dodaj web search tool kada AI treba aktuelne cijene
    if (webSearch) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3
        }
      ]
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API greška' })
    }

    // Izvuci samo text blokove (ignorisi tool_use i tool_result blokove)
    const textContent = data.content?.filter(b => b.type === 'text') || []

    return res.status(200).json({ content: textContent })

  } catch (err) {
    console.error('Chat API greška:', err)
    return res.status(500).json({ error: err.message })
  }
}
