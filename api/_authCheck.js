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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hojtbvodaadwofxgayip.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvanRidm9kYWFkd29meGdheWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1Mjc2MzQsImV4cCI6MjA5ODEwMzYzNH0.9FfY4u3B8W_m8ltl3D6_xa78uEp9jOgaMst9JS5gy74'

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
