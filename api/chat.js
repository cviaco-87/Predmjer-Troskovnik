import { proveriAutentikaciju } from './_authCheck.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// ── CIJENA PO TOKENU (Claude Sonnet 5, uvodna cijena) ──
// VAŽNO: uvodna cijena $2/$10 po milion tokena važi do 31.8.2026, poslije toga standardna
// cijena je $3/$15 po milion tokena — treba ručno ažurirati ove konstante na taj datum (ili
// ranije ako Anthropic promijeni cijenu prije toga). Izmjena ovdje utiče SAMO na buduće
// pozive — već upisani redovi u ai_potrosnja čuvaju cijenu izračunatu u trenutku tog poziva,
// pa historijski podaci ostaju tačni bez obzira na kasnije promjene cijene.
const CIJENA_ULAZ_PO_MTOK = 2    // $ po milion ulaznih tokena
const CIJENA_IZLAZ_PO_MTOK = 10  // $ po milion izlaznih tokena
const CIJENA_PO_PRETRAZI = 0.01  // $ po jednoj web pretrazi (web_search alat)

// ── RATE LIMITING (iz baze — tabela ai_potrosnja) ──
// RANIJE: brojač u memoriji instance (Map). Radio je unutar JEDNE pokrenute instance, ali
// Vercel povremeno pokrene više instanci (svaka svoj brojač) ili "ohladi" instancu (brojač se
// resetuje na nulu) — pa limit nije bio pouzdan preko svih instanci.
// SADA: broji se koliko je AI poziva ovaj korisnik napravio u zadnjih sat vremena direktno iz
// tabele `ai_potrosnja` (koristi indeks ai_potrosnja_user_datum_idx). Baza je jedan zajednički
// izvor istine za SVE instance, pa hladni start i više instanci više ne prave rupu. Nema nove
// infrastrukture — koristi tabelu i indeks koji već postoje.
//
// 100/sat: procjena cijena radi U PAKETIMA (svaki paket = zaseban poziv), pa jedan klik
// "Procijeni cijeli projekat" na velikom projektu može biti 10+ poziva. 30/sat bi legitimnog
// korisnika prebrzo blokirao; 100 pokriva realno intenzivno korišćenje a i dalje štiti budžet.
const MAX_ZAHTJEVA_PO_SATU = 100

async function jeLimitPredjen(supabase, userId) {
  const prijeSatVremena = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  // head:true + count:'exact' → vraća SAMO broj redova (ne i same redove) = brz upit.
  const { count, error } = await supabase
    .from('ai_potrosnja')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('kreiran_at', prijeSatVremena)
  if (error) {
    // FAIL-OPEN: ako brojanje iz bilo kog razloga padne (npr. kratak prekid baze), NE blokiramo
    // korisnika — radije propuštamo poziv nego da zaustavimo rad zbog greške u pomoćnoj provjeri.
    // Prijava (proveriAutentikaciju) i dalje štiti endpoint od potpuno stranih poziva.
    console.error('Rate limit - greška pri brojanju iz baze, propuštam zahtjev:', error)
    return false
  }
  return (count || 0) >= MAX_ZAHTJEVA_PO_SATU
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

  // Klijent autentifikovan JWT-om OVOG korisnika — koristi se i za rate-limit brojanje i za
  // upis potrošnje. Kroz RLS (auth.uid() = user_id) svaki korisnik vidi/piše samo svoje redove.
  const authHeader = req.headers['authorization'] || req.headers['Authorization']
  const token = authHeader.slice('Bearer '.length).trim()
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  // ── RATE LIMITING — sprečava da jedan korisnik (ili neko ko mu ukrade token) potroši sav budžet ──
  if (await jeLimitPredjen(supabase, auth.userId)) {
    return res.status(429).json({ error: 'Previše zahtjeva u proteklom satu. Molimo pokušajte ponovo kasnije.' })
  }

  try {
    const { system, messages, webSearch = false, tip = 'opste' } = req.body
    const body = {
      // Sonnet 5 — bolji odnos cijene i kvaliteta od Opusa za ovu vrstu zadatka (procjena cijena,
      // generisanje pozicija). Uvodna cijena $2/$10 po milion tokena važi do 31.8.2026, poslije
      // toga standardnih $3/$15 — u oba slučaja i dalje znatno jeftinije od Opusa ($5/$25).
      model: 'claude-sonnet-5',
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

    // ── LOGOVANJE POTROŠNJE TOKENA ──
    // Anthropic u data.usage vraća tačan broj potrošenih tokena za OVAJ poziv (ne procjenu).
    // Ovo je best-effort: ako upis u bazu ne uspije iz bilo kog razloga, korisnik i dalje
    // dobija svoj AI odgovor normalno — logovanje potrošnje nikad ne smije blokirati ili
    // pokvariti stvarnu funkcionalnost AI Asistenta.
    // NAPOMENA: ovaj upis je ujedno i "brojač" za rate-limit gore — svaki uspješan poziv doda
    // jedan red, koji se broji u narednih sat vremena.
    let potrosnja = null
    try {
      const ulazniTokeni = data.usage?.input_tokens || 0
      const izlazniTokeni = data.usage?.output_tokens || 0
      const brojPretraga = data.usage?.server_tool_use?.web_search_requests || 0
      const cijenaUsd =
        (ulazniTokeni / 1e6) * CIJENA_ULAZ_PO_MTOK +
        (izlazniTokeni / 1e6) * CIJENA_IZLAZ_PO_MTOK +
        brojPretraga * CIJENA_PO_PRETRAZI

      potrosnja = { ulazniTokeni, izlazniTokeni, brojPretraga, cijenaUsd }

      const { error: logError } = await supabase.from('ai_potrosnja').insert({
        user_id: auth.userId,
        tip,
        ulazni_tokeni: ulazniTokeni,
        izlazni_tokeni: izlazniTokeni,
        broj_pretraga: brojPretraga,
        cijena_usd: Math.round(cijenaUsd * 1e6) / 1e6
      })
      if (logError) console.error('Greška pri logovanju potrošnje tokena:', logError)
    } catch (logErr) {
      console.error('Greška pri logovanju potrošnje tokena:', logErr)
    }

    // Izvuci samo text blokove (ignorisi tool_use i tool_result blokove)
    const textContent = data.content?.filter(b => b.type === 'text') || []
    return res.status(200).json({ content: textContent, potrosnja })
  } catch (err) {
    console.error('Chat API greška:', err)
    return res.status(500).json({ error: err.message })
  }
}
