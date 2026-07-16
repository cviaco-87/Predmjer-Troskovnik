import { proveriAutentikaciju } from './_authCheck.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// ── AUTOMATSKO PRAĆENJE KURSA VALUTE ──
// Zamjenjuje ranije ručno ažurirane fiksne konstante u App.jsx (KURSEVI). Umjesto da neko
// mijenja brojeve u kodu svaki put kad kurs "odluta", ovaj endpoint sam povlači aktuelan kurs
// i čuva ga u tabeli `kursevi` (vidi migracija_kursevi.sql).

const MAX_STAROST_MS = 24 * 60 * 60 * 1000 // 24h

// KM (konvertibilna marka) je fiksno vezana za EUR valutnim odborom (currency board) — taj
// odnos se po zakonu ne mijenja, pa nema smisla "pratiti" njen kurs. Ostaje konstanta.
const KM_KURS = 1.95583

// Rezervne vrijednosti KAO POSLJEDNJE utočište — samo ako baza nikad nije upisala nijedan
// kurs I eksterni izvor istovremeno ne radi.
const REZERVNI_KURSEVI = { EUR: 1, KM: KM_KURS, RSD: 117.37, USD: 1.1471 }

// ── JEDAN IZVOR ZA USD I RSD — Narodna banka Srbije (preko kurs.resenje.org, besplatan
// javni wrapper oko zvaničnih NBS podataka, bez ključa, ažurira se svaki dan u 8h). RANIJA
// verzija je USD vukla sa ECB-a (Frankfurter) a RSD sa NBS-a — dva RAZLIČITA izvora za dvije
// valute vezane za istu bazu (EUR), što je davalo primjetno odstupanje (do ~0.5-0.6%, otkriveno
// jul 2026. poređenjem sa zvaničnim kursom) jer ECB i NBS objavljuju EUR/USD sa različitim
// dnevnim presjekom tržišta. Sad se i USD i RSD računaju IZ ISTOG NBS očitavanja, pa su
// međusobno i sa KM (koji je i sam NBS/valutni-odbor vezan za EUR) potpuno konzistentni —
// isti "zvanični kurs" koji korisnik vidi kad provjeri NBS kursnu listu.
async function povuciKurseveNBS() {
  const r = await fetch('https://kurs.resenje.org/api/v1/rates/today?currency_pair=EUR_RSD')
  if (!r.ok) throw new Error('Kurs API (NBS) nije dostupan (status ' + r.status + ')')
  const data = await r.json()
  const eur = (data?.rates || []).find(x => x.code === 'EUR')
  const usd = (data?.rates || []).find(x => x.code === 'USD')
  if (!eur?.exchange_middle) throw new Error('Kurs API nije vratio EUR/RSD kurs')
  if (!usd?.exchange_middle) throw new Error('Kurs API nije vratio USD/RSD kurs')
  return {
    RSD: eur.exchange_middle,                        // koliko RSD vrijedi 1 EUR
    USD: eur.exchange_middle / usd.exchange_middle,   // koliko USD vrijedi 1 EUR (isti NBS presjek za oba)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await proveriAutentikaciju(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

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

    // USD i RSD dolaze iz ISTOG NBS očitavanja (vidi napomenu uz povuciKurseveNBS) — ako je
    // ijedan od njih zastario, osvježavamo oba u jednom pozivu (svakako stižu zajedno).
    if (jeSvjez('USD') && jeSvjez('RSD')) {
      rezultat.USD = mapaKesa.USD.vrijednost
      rezultat.RSD = mapaKesa.RSD.vrijednost
    } else {
      try {
        const nbs = await povuciKurseveNBS()
        rezultat.USD = nbs.USD
        rezultat.RSD = nbs.RSD
        azuriranoUzivo = true
        const sadaIso = new Date().toISOString()
        await supabase.from('kursevi').upsert([
          { kod: 'USD', vrijednost: nbs.USD, azurirano_at: sadaIso },
          { kod: 'RSD', vrijednost: nbs.RSD, azurirano_at: sadaIso },
        ])
        mapaKesa.USD = { vrijednost: nbs.USD, azurirano_at: sadaIso }
        mapaKesa.RSD = { vrijednost: nbs.RSD, azurirano_at: sadaIso }
      } catch (e) {
        console.error('Kurs NBS - eksterni izvor nije dostupan, koristim keš/rezervu:', e.message)
        rezultat.USD = mapaKesa.USD?.vrijednost || REZERVNI_KURSEVI.USD
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
