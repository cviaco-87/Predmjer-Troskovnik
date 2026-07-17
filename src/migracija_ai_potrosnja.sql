-- =============================================================
-- MIGRACIJA: tabela `ai_potrosnja`  (praćenje potrošnje AI tokena i troška)
-- Pokreni jednom u Supabase → SQL Editor. Bezbjedno i ako tabela već postoji.
-- Upisuje je /api/chat.js poslije svakog AI poziva (broj tokena + izračunata cijena u USD).
-- Čita je AIAsistent.jsx za mjesečni sažetak potrošnje (filter po `kreiran_at`).
-- =============================================================

CREATE TABLE IF NOT EXISTS ai_potrosnja (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- DEFAULT auth.uid(): chat.js šalje user_id eksplicitno, ali default je sigurnosna mreža
  -- i čini upis konzistentnim sa ostalim tabelama.
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  tip            TEXT DEFAULT 'opste',   -- oznaka vrste radnje (npr. procjena cijene, uslovi...)
  ulazni_tokeni  INTEGER DEFAULT 0,
  izlazni_tokeni INTEGER DEFAULT 0,
  broj_pretraga  INTEGER DEFAULT 0,      -- broj web pretraga u tom pozivu (web_search alat)
  cijena_usd     NUMERIC DEFAULT 0,      -- izračunat trošak tog poziva u USD
  kreiran_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks za brzo filtriranje mjesečne potrošnje po korisniku (upit u AIAsistent.jsx).
CREATE INDEX IF NOT EXISTS ai_potrosnja_user_datum_idx
  ON ai_potrosnja (user_id, kreiran_at);

-- RLS: svako vidi i upisuje SAMO svoju potrošnju.
ALTER TABLE ai_potrosnja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Korisnik vidi svoju potrosnju" ON ai_potrosnja;
CREATE POLICY "Korisnik vidi svoju potrosnju" ON ai_potrosnja
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

SELECT 'Migracija ai_potrosnja: gotovo.' AS status;
