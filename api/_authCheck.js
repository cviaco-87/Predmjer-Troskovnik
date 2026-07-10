// api/_authCheck.js
//
// Zajednička provjera autentikacije za sve serverless API endpointe (/api/chat, /api/excel).
// Svaki zahtjev sa frontenda mora nositi važeći Supabase JWT token prijavljenog korisnika,
// poslat u Authorization headeru kao "Bearer <token>". Ova funkcija provjerava taj token
// direktno kod Supabase-a (ne vjeruje se samom tokenu bez provjere) prije nego što zahtjev
// dobije pristup do Anthropic API ključa ili Excel generisanja.
//
// Zašto je ovo potrebno: bez ove provjere, bilo ko na internetu ko otkrije URL ovih
// endpointa (vidljiv u network tabu preglednika) mogao bi ih pozivati neograničeno,
// trošeći Anthropic API budžet vlasnika aplikacije bez ikakvog ograničenja.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// KLJUČNO: prije je ovdje postojao hardkodovani fallback (|| 'https://...') za slučaj da env
// varijabla nedostaje. Anon ključ jeste dizajniran da bude javan (štiti ga RLS, ne tajnost),
// pa to nije bio sigurnosni curenje — ali "tiho nastavi sa starom upisanom vrijednošću" je
// opasan obrazac: ako env varijabla na Vercelu ikad nestane ili se pogrešno postavi (typo,
// slučajno brisanje pri redeployu), aplikacija bi mogla mjesecima tiho raditi protiv
// pogrešnog/zastarjelog Supabase projekta a da se to ne primijeti. Sad umjesto toga funkcija
// odmah, vidljivo puca pri pokretanju ako env varijable nedostaju — "fail loudly", ne
// "fail silently sa starim podacima".
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Nedostaju SUPABASE_URL ili SUPABASE_ANON_KEY env varijable na serveru. ' +
    'Provjerite Vercel Project Settings → Environment Variables.'
  )
}

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Provjerava Authorization header zahtjeva. Vraća { ok: true, userId } ako je token
 * validan, ili { ok: false, status, error } ako nije (koristiti za rani izlazak iz handlera).
 */
export async function proveriAutentikaciju(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Nedostaje prijava. Molimo prijavite se ponovo.' }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return { ok: false, status: 401, error: 'Nedostaje prijava. Molimo prijavite se ponovo.' }
  }
  const { data, error } = await supabaseServer.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Sesija je istekla. Molimo prijavite se ponovo.' }
  }
  return { ok: true, userId: data.user.id }
}
