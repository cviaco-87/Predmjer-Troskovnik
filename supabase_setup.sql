-- =============================================================
-- PREDMJER / TROŠKOVNIK — KOMPLETNA ŠEMA BAZE (kanonska verzija)
-- Pokreni u Supabase → SQL Editor.
--
-- Ovaj fajl je IDEMPOTENTAN: koristi CREATE TABLE IF NOT EXISTS i
-- ADD COLUMN IF NOT EXISTS, pa je bezbjedno pokrenuti ga i na PRAZNOJ bazi
-- (pravi sve od nule) i na POSTOJEĆOJ živoj bazi (samo dopunjava ono što fali,
-- ne dira i ne briše postojeće podatke).
--
-- Zamjenjuje raniji supabase_setup.sql koji je bio zastario (imao samo 4 tabele
-- i pogrešne/nepostojeće kolone). Sada pokriva svih 7 tabela koje aplikacija stvarno
-- koristi: projekti, faze, pozicije, moja_baza, firma_postavke, kursevi, ai_potrosnja.
--
-- VAŽNO — user_id DEFAULT auth.uid():
-- Aplikacija pri kreiranju/kloniranju projekata, faza i pozicija NE šalje user_id
-- eksplicitno. Zato te kolone MORAJU imati DEFAULT auth.uid() — inače bi insert pao na
-- NOT NULL. Ovaj fajl to postavlja izričito.
-- =============================================================


-- =============================================================
-- 1. PROJEKTI
-- =============================================================
CREATE TABLE IF NOT EXISTS projekti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  naziv TEXT NOT NULL DEFAULT 'Novi projekat',
  klijent TEXT DEFAULT '',
  adresa TEXT DEFAULT '',
  datum DATE DEFAULT CURRENT_DATE,
  kreiran_at TIMESTAMPTZ DEFAULT NOW(),
  azuriran_at TIMESTAMPTZ DEFAULT NOW()
);
-- Dopune (za postojeće baze koje su nastale sa starijom šemom):
ALTER TABLE projekti ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS valuta TEXT DEFAULT 'EUR';
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS struke JSONB;                    -- struke sa nazivima i uv/um po struci
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS uvecanje_pct NUMERIC DEFAULT 0;
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS umanjenje_pct NUMERIC DEFAULT 0;
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS zadnja_struka_kod TEXT;          -- pamti gdje je korisnik stao
-- Legacy kolone (starije verzije uv/um po radovima/materijalu) — kod ih još čita kao rezervu:
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS uv_radovi NUMERIC DEFAULT 0;
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS uv_materijal NUMERIC DEFAULT 0;
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS um_radovi NUMERIC DEFAULT 0;
ALTER TABLE projekti ADD COLUMN IF NOT EXISTS um_materijal NUMERIC DEFAULT 0;


-- =============================================================
-- 2. FAZE (grupe radova)
-- =============================================================
CREATE TABLE IF NOT EXISTS faze (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  projekat_id UUID REFERENCES projekti(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  naziv TEXT NOT NULL,
  redoslijed INTEGER DEFAULT 0,
  kreiran_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE faze ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE faze ADD COLUMN IF NOT EXISTS struka_kod TEXT DEFAULT 'gradjevinski';
ALTER TABLE faze ADD COLUMN IF NOT EXISTS opsti_uslovi TEXT;   -- opšti tehnički uslovi grupe radova
ALTER TABLE faze ADD COLUMN IF NOT EXISTS kategorija TEXT;     -- vezana kategorija šifarnika (predefinisana grupa); NULL = prilagođena


-- =============================================================
-- 3. POZICIJE (stavke; podržavaju roditelj/podstavka preko parent_id)
-- =============================================================
CREATE TABLE IF NOT EXISTS pozicije (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  faza_id UUID REFERENCES faze(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  naziv TEXT NOT NULL,
  jedinica TEXT DEFAULT 'kom',
  cijena NUMERIC DEFAULT 0,
  kolicina NUMERIC DEFAULT 0,
  rabat NUMERIC DEFAULT 0,
  kategorija TEXT DEFAULT 'Ostalo',
  redoslijed INTEGER DEFAULT 0,
  beleska TEXT DEFAULT '',
  kreiran_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pozicije ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE pozicije ADD COLUMN IF NOT EXISTS sifra TEXT;          -- šifra pozicije iz baze (npr. '03')
ALTER TABLE pozicije ADD COLUMN IF NOT EXISTS opis_visina NUMERIC; -- zapamćena visina ćelije opisa (auto-grow)
ALTER TABLE pozicije ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES pozicije(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS pozicije_faza_idx   ON pozicije (faza_id);
CREATE INDEX IF NOT EXISTS pozicije_parent_idx ON pozicije (parent_id);


-- =============================================================
-- 4. MOJA BAZA (personalne stavke korisnika)
-- =============================================================
CREATE TABLE IF NOT EXISTS moja_baza (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  naziv TEXT NOT NULL,
  jedinica TEXT DEFAULT 'kom',
  cijena NUMERIC DEFAULT 0,
  kategorija TEXT DEFAULT 'Moje stavke',
  opis TEXT DEFAULT '',
  kreiran_at TIMESTAMPTZ DEFAULT NOW(),
  azuriran_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE moja_baza ALTER COLUMN user_id SET DEFAULT auth.uid();


-- =============================================================
-- 5. FIRMA_POSTAVKE (logo i naziv firme za PDF/Excel zaglavlje; 1 red po korisniku)
-- =============================================================
CREATE TABLE IF NOT EXISTS firma_postavke (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE DEFAULT auth.uid(),
  logo TEXT,          -- logo kao data URL (base64) — može biti veliki, zato TEXT
  naziv TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE firma_postavke ALTER COLUMN user_id SET DEFAULT auth.uid();


-- =============================================================
-- 6. KURSEVI (keš dnevnog kursa; ZAJEDNIČKI, nije po korisniku)
-- =============================================================
CREATE TABLE IF NOT EXISTS kursevi (
  kod TEXT PRIMARY KEY,              -- 'USD' | 'RSD'
  vrijednost NUMERIC NOT NULL,       -- koliko te valute vrijedi 1 EUR
  azurirano_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================
-- 7. AI_POTROSNJA (praćenje tokena i troška AI poziva)
-- =============================================================
CREATE TABLE IF NOT EXISTS ai_potrosnja (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  tip TEXT DEFAULT 'opste',
  ulazni_tokeni INTEGER DEFAULT 0,
  izlazni_tokeni INTEGER DEFAULT 0,
  broj_pretraga INTEGER DEFAULT 0,
  cijena_usd NUMERIC DEFAULT 0,
  kreiran_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_potrosnja_user_datum_idx ON ai_potrosnja (user_id, kreiran_at);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE projekti        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faze            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pozicije        ENABLE ROW LEVEL SECURITY;
ALTER TABLE moja_baza       ENABLE ROW LEVEL SECURITY;
ALTER TABLE firma_postavke  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kursevi         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_potrosnja    ENABLE ROW LEVEL SECURITY;

-- Politike "svako vidi samo svoje" (USING + WITH CHECK — WITH CHECK štiti i INSERT/UPDATE).
DROP POLICY IF EXISTS "Korisnik vidi svoje projekte" ON projekti;
CREATE POLICY "Korisnik vidi svoje projekte" ON projekti
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Korisnik vidi svoje faze" ON faze;
CREATE POLICY "Korisnik vidi svoje faze" ON faze
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Korisnik vidi svoje pozicije" ON pozicije;
CREATE POLICY "Korisnik vidi svoje pozicije" ON pozicije
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Korisnik vidi svoju bazu" ON moja_baza;
CREATE POLICY "Korisnik vidi svoju bazu" ON moja_baza
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Korisnik vidi svoje postavke firme" ON firma_postavke;
CREATE POLICY "Korisnik vidi svoje postavke firme" ON firma_postavke
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Korisnik vidi svoju potrosnju" ON ai_potrosnja;
CREATE POLICY "Korisnik vidi svoju potrosnju" ON ai_potrosnja
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Kursevi su ZAJEDNIČKI: svaki prijavljen korisnik čita; upis ide njegovim JWT-om.
-- (Za produkciju sa nepoznatim korisnicima: ograniči upis na service-role — vidi migracija_kursevi.sql)
DROP POLICY IF EXISTS "Kursevi - citanje za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - citanje za prijavljene" ON kursevi
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Kursevi - upis za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - upis za prijavljene" ON kursevi
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Kursevi - izmjena za prijavljene" ON kursevi;
CREATE POLICY "Kursevi - izmjena za prijavljene" ON kursevi
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =============================================================
-- AUTOMATSKI updated/azuriran timestamp pri izmjeni
-- =============================================================
CREATE OR REPLACE FUNCTION update_azuriran_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.azuriran_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projekti_azuriran ON projekti;
CREATE TRIGGER projekti_azuriran
  BEFORE UPDATE ON projekti
  FOR EACH ROW EXECUTE FUNCTION update_azuriran_at();

DROP TRIGGER IF EXISTS moja_baza_azuriran ON moja_baza;
CREATE TRIGGER moja_baza_azuriran
  BEFORE UPDATE ON moja_baza
  FOR EACH ROW EXECUTE FUNCTION update_azuriran_at();

DROP TRIGGER IF EXISTS firma_postavke_azuriran ON firma_postavke;
CREATE TRIGGER firma_postavke_azuriran
  BEFORE UPDATE ON firma_postavke
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


SELECT 'Baza podataka usklađena / kreirana — svih 7 tabela spremno.' AS status;
