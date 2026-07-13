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

      // KLJUČNO: klijent ovdje MORA biti autentifikovan JWT tokenom OVOG korisnika (isti token
      // koji je već provjeren u proveriAutentikaciju), ne anon ključem "golim" i ne service role
      // ključem. Bez ovoga bi auth.uid() unutar RLS politike bio prazan i upis bi pao (ili bi
      // trebalo zaobići RLS service role ključem, što uvodi novu tajnu i veći sigurnosni rizik
      // bez stvarne potrebe — ovako upis prolazi kroz ISTI RLS mehanizam kao i svaki drugi upis
      // u aplikaciji, auth.uid() = user_id).
      const authHeader = req.headers['authorization'] || req.headers['Authorization']
      const token = authHeader.slice('Bearer '.length).trim()
      const supabaseKorisnik = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      })
      const { error: logError } = await supabaseKorisnik.from('ai_potrosnja').insert({
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
