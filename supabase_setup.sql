-- =============================================
-- PREDMJER / TROŠKOVNIK - Baza podataka
-- Pokreni ovo u Supabase SQL Editor
-- =============================================

-- 1. PROJEKTI (svaki korisnik ima svoje projekte)
CREATE TABLE IF NOT EXISTS projekti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  naziv TEXT NOT NULL DEFAULT 'Novi projekat',
  klijent TEXT DEFAULT '',
  adresa TEXT DEFAULT '',
  datum DATE DEFAULT CURRENT_DATE,
  uv_radovi NUMERIC DEFAULT 0,
  uv_materijal NUMERIC DEFAULT 0,
  kreiran_at TIMESTAMPTZ DEFAULT NOW(),
  azuriran_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FAZE (svaki projekat ima faze)
CREATE TABLE IF NOT EXISTS faze (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  projekat_id UUID REFERENCES projekti(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  naziv TEXT NOT NULL,
  redoslijed INTEGER DEFAULT 0,
  kreiran_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. POZICIJE (svaka faza ima pozicije)
CREATE TABLE IF NOT EXISTS pozicije (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  faza_id UUID REFERENCES faze(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- 4. MOJA BAZA (personalne stavke korisnika)
CREATE TABLE IF NOT EXISTS moja_baza (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  naziv TEXT NOT NULL,
  jedinica TEXT DEFAULT 'kom',
  cijena NUMERIC DEFAULT 0,
  kategorija TEXT DEFAULT 'Moje stavke',
  opis TEXT DEFAULT '',
  kreiran_at TIMESTAMPTZ DEFAULT NOW(),
  azuriran_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (svako vidi samo svoje)
-- =============================================

ALTER TABLE projekti ENABLE ROW LEVEL SECURITY;
ALTER TABLE faze ENABLE ROW LEVEL SECURITY;
ALTER TABLE pozicije ENABLE ROW LEVEL SECURITY;
ALTER TABLE moja_baza ENABLE ROW LEVEL SECURITY;

-- Politike za projekti
CREATE POLICY "Korisnik vidi svoje projekte" ON projekti
  FOR ALL USING (auth.uid() = user_id);

-- Politike za faze
CREATE POLICY "Korisnik vidi svoje faze" ON faze
  FOR ALL USING (auth.uid() = user_id);

-- Politike za pozicije
CREATE POLICY "Korisnik vidi svoje pozicije" ON pozicije
  FOR ALL USING (auth.uid() = user_id);

-- Politike za moju bazu
CREATE POLICY "Korisnik vidi svoju bazu" ON moja_baza
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- AUTOMATSKI TIMESTAMP PRI IZMJENI
-- =============================================
CREATE OR REPLACE FUNCTION update_azuriran_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.azuriran_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projekti_azuriran
  BEFORE UPDATE ON projekti
  FOR EACH ROW EXECUTE FUNCTION update_azuriran_at();

CREATE TRIGGER moja_baza_azuriran
  BEFORE UPDATE ON moja_baza
  FOR EACH ROW EXECUTE FUNCTION update_azuriran_at();

-- Gotovo!
SELECT 'Baza podataka uspješno kreirana!' as status;
