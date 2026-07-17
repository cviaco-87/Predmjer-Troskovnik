-- =============================================================
-- MIGRACIJA: tabela `kursevi`  (keš dnevnog valutnog kursa)
-- Pokreni jednom u Supabase → SQL Editor.
-- Bezbjedno je pokrenuti i ako tabela već postoji (IF NOT EXISTS / DROP-CREATE politike).
-- Ovu tabelu koristi /api/kurs.js za keširanje kursa RSD i USD (24h), da ne bi gađao
-- eksterni NBS izvor pri svakom otvaranju aplikacije.
-- =============================================================

-- `kod` je primarni ključ jer kurs.js radi upsert po koloni `kod` (USD / RSD).
CREATE TABLE IF NOT EXISTS kursevi (
  kod           TEXT PRIMARY KEY,          -- 'USD' | 'RSD'
  vrijednost    NUMERIC NOT NULL,          -- koliko te valute vrijedi 1 EUR
  azurirano_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: kurs je ZAJEDNIČKI podatak (nije vezan za korisnika) — svaki prijavljen korisnik
-- ga smije čitati, a endpoint ga upisuje u ime prijavljenog korisnika (njegovim JWT-om).
-- NAPOMENA O KOMPROMISU: ovako svaki prijavljen korisnik može i da prepiše keširani kurs.
-- Za pilot sa vjerodostojnim korisnicima je prihvatljivo; kad budeš skalirao na nepoznate
-- korisnike, upis kursa prebaci na service-role ključ (samo server piše), a korisnicima ostavi
-- samo čitanje. Tada obriši dvije politike za upis/izmjenu ispod.
ALTER TABLE kursevi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kursevi - citanje za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - citanje za prijavljene" ON kursevi
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Kursevi - upis za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - upis za prijavljene" ON kursevi
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Kursevi - izmjena za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - izmjena za prijavljene" ON kursevi
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

SELECT 'Migracija kursevi: gotovo.' AS status;
