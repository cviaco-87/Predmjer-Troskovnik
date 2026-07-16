import { proveriAutentikaciju } from './_authCheck.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// ── AUTOMATSKO PRAĆENJE KURSA VALUTE ──
// Zamjenjuje ranije ručno ažurirane fiksne konstante u App.jsx (KURSEVI). Umjesto da neko
// mijenja brojeve u kodu svaki put kad kurs "odluta", ovaj endpoint sam povlači aktuelan kurs
// sa zvaničnih/pouzdanih izvora i čuva ga u tabeli `kursevi` (vidi migracija_kursevi.sql).
//
// Strategija (bez potrebe za Vercel cron-om — jednostavnije za održavanje):
//   1. Pročitaj zadnji poznati kurs iz baze.
//   2. Ako je stariji od MAX_STAROST_MS (24h), pokušaj povući svjež kurs uživo i upiši ga u bazu.
//   3. Ako eksterni izvor padne (mreža, downtime...), koristi zadnji poznati kurs iz baze.
//   4. Ako baza uopšte nema podatak (prvi put), koristi REZERVNI_KURSEVI ispod.
// Prvi korisnik koji otvori app poslije isteka 24h "plaća" tu jednu sporiju provjeru (jedan
// eksterni HTTP poziv), svi ostali tog dana čitaju iz baze — brzo i bez zavisnosti od toga
// da li je eksterni API tog trenutka dostupan.

const MAX_STAROST_MS = 24 * 60 * 60 * 1000 // 24h

// KM (konvertibilna marka) je fiksno vezana za EUR valutnim odborom (currency board) — taj
// odnos se po zakonu ne mijenja, pa nema smisla "pratiti" njen kurs. Ostaje konstanta.
const KM_KURS = 1.95583

// Rezervne vrijednosti KAO POSLJEDNJE utočište — koriste se samo ako baza nikad nije upisala
// nijedan kurs I eksterni izvori istovremeno ne rade (npr. prvi deploy prije prve uspješne
// sinhronizacije). Približne vrijednosti iz jula 2026 — app će ih automatski zamijeniti
// stvarnim kursom čim prvi poziv uspije.
const REZERVNI_KURSEVI = { EUR: 1, KM: KM_KURS, RSD: 117.37, USD: 1.147 }

// Izvor za EUR→USD: Frankfurter (podaci Evropske centralne banke), besplatan, bez ključa,
// ažurira se svakog radnog dana.
async function povuciEurUsd() {
  const r = await fetch('https://api.frankfurter.dev/v1/latest?from=EUR&to=USD')
  if (!r.ok) throw new Error('Frankfurter API nije dostupan (status ' + r.status + ')')
  const data = await r.json()
  const v = data?.rates?.USD
  if (!v) throw new Error('Frankfurter nije vratio USD kurs')
  return v
}

// Izvor za EUR→RSD: kurs.resenje.org — besplatan javni wrapper oko zvaničnih podataka
// Narodne banke Srbije (NBS), bez ključa, ažurira se svaki dan u 8h (Europe/Belgrade).
async function povuciEurRsd() {
  const r = await fetch('https://kurs.resenje.org/api/v1/rates/today?currency_pair=EUR_RSD')
  if (!r.ok) throw new Error('Kurs API (NBS) nije dostupan (status ' + r.status + ')')
  const data = await r.json()
  const eur = (data?.rates || []).find(x => x.code === 'EUR')
  if (!eur?.exchange_middle) throw new Error('Kurs API nije vratio EUR/RSD kurs')
  return eur.exchange_middle
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Ista provjera prijave kao i ostali endpointi — kurs API i dalje troši (male, ali stvarne)
  // eksterne pozive, ne treba biti otvoren anonimno bilo kome ko otkrije URL.
  const auth = await proveriAutentikaciju(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  // Krajnji "osiguravajući" fallback — kurs NIKAD ne smije srušiti app. Ako bilo šta ispod
  // pukne na neočekivan način, korisnik i dalje dobija upotrebljive (makar i rezervne) brojeve.
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization']
    const token = authHeader.slice('Bearer '.length).trim()
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: keširano, error: readError } = await supabase
      .from('kursevi')
      .select('kod, vrijednost, azurirano_at')
    if (readError) console.error('Kurs API - greška pri čitanju keša:', readError)

    const mapaKesa = {}
    ;(keširano || []).forEach(r => { mapaKesa[r.kod] = r })

    const sada = Date.now()
    const jeSvjez = kod => mapaKesa[kod] && (sada - new Date(mapaKesa[kod].azurirano_at).getTime()) < MAX_STAROST_MS

    const rezultat = { EUR: 1, KM: KM_KURS }
    let azuriranoUzivo = false

    // ── USD ──
    if (jeSvjez('USD')) {
      rezultat.USD = mapaKesa.USD.vrijednost
    } else {
      try {
        rezultat.USD = await povuciEurUsd()
        azuriranoUzivo = true
        const sadaIso = new Date().toISOString()
        await supabase.from('kursevi').upsert({ kod: 'USD', vrijednost: rezultat.USD, azurirano_at: sadaIso })
        mapaKesa.USD = { vrijednost: rezultat.USD, azurirano_at: sadaIso }
      } catch (e) {
        console.error('Kurs USD - eksterni izvor nije dostupan, koristim keš/rezervu:', e.message)
        rezultat.USD = mapaKesa.USD?.vrijednost || REZERVNI_KURSEVI.USD
      }
    }

    // ── RSD ──
    if (jeSvjez('RSD')) {
      rezultat.RSD = mapaKesa.RSD.vrijednost
    } else {
      try {
        rezultat.RSD = await povuciEurRsd()
        azuriranoUzivo = true
        const sadaIso = new Date().toISOString()
        await supabase.from('kursevi').upsert({ kod: 'RSD', vrijednost: rezultat.RSD, azurirano_at: sadaIso })
        mapaKesa.RSD = { vrijednost: rezultat.RSD, azurirano_at: sadaIso }
      } catch (e) {
        console.error('Kurs RSD - eksterni izvor nije dostupan, koristim keš/rezervu:', e.message)
        rezultat.RSD = mapaKesa.RSD?.vrijednost || REZERVNI_KURSEVI.RSD
      }
    }

    return res.status(200).json({
      kursevi: rezultat,
      azuriranoUzivo,
      datumUSD: mapaKesa.USD?.azurirano_at || null,
      datumRSD: mapaKesa.RSD?.azurirano_at || null,
    })
  } catch (err) {
    console.error('Kurs API greška:', err.stack || err.message)
    return res.status(200).json({ kursevi: REZERVNI_KURSEVI, azuriranoUzivo: false, greska: err.message })
  }
}
