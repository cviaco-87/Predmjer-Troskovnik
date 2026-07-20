import React, { useState, useMemo, useCallback, useEffect } from "react"
import AIAsistent from "./AIAsistent.jsx"
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import MojaBaza from './MojaBaza.jsx'
import { SABLONI_USLOVI } from './sabloniUslovi.js'
import Uputstvo from './Uputstvo.jsx'

// Redoslijed kategorija prema šifarniku baze (01, 02, 03...) i podjela na dvije faze izvođenja:
// grubi (konstruktivni) građevinski radovi i završni (zanatski/instalaterski) radovi,
// u skladu sa uobičajenim redoslijedom izvođenja na gradilištu.
const REDOSLIJED_KATEGORIJA = [
  // ── PRIPREMNI RADOVI I RUŠENJE (prethode grubim radovima — priprema gradilišta,
  // uklanjanje postojećih konstrukcija/instalacija prije nove gradnje ili sanacije) ──
  { sifra: '01', naziv: 'Pripremno-završni radovi',  grupa: 'pripremni' },
  { sifra: '01a', naziv: 'Demontaže i rušenja',       grupa: 'pripremni' },
  // ── GRUBI GRAĐEVINSKI RADOVI (nosiva konstrukcija i omotač objekta) ──
  { sifra: '02', naziv: 'Zemljani radovi',           grupa: 'grubi' },
  { sifra: '03', naziv: 'Betonski i AB radovi',      grupa: 'grubi' },
  { sifra: '04', naziv: 'Zidarski radovi',           grupa: 'grubi' },
  { sifra: '05', naziv: 'Izolaterski radovi',        grupa: 'grubi' },
  { sifra: '07', naziv: 'Tesarski radovi',           grupa: 'grubi' },
  { sifra: '08', naziv: 'Pokrivački radovi',         grupa: 'grubi' },
  // ── ZAVRŠNI GRAĐEVINSKO-ZANATSKI RADOVI ──
  { sifra: '06', naziv: 'Fasaderski radovi',          grupa: 'zavrsni' },
  { sifra: '09', naziv: 'Limarski radovi',            grupa: 'zavrsni' },
  { sifra: '10', naziv: 'Građevinska stolarija',      grupa: 'zavrsni' },
  { sifra: '11', naziv: 'Bravarski radovi',           grupa: 'zavrsni' },
  { sifra: '12', naziv: 'Gipsarski radovi',           grupa: 'zavrsni' },
  { sifra: '13', naziv: 'Podopolagački radovi',       grupa: 'zavrsni' },
  { sifra: '14', naziv: 'Molersko-farbarski radovi',  grupa: 'zavrsni' },
  { sifra: '21', naziv: 'Stolarski radovi',           grupa: 'zavrsni' },
  { sifra: '22', naziv: 'Kamenorezački radovi',       grupa: 'zavrsni' },
  { sifra: '23', naziv: 'Konzervatorski radovi',      grupa: 'zavrsni' },
  { sifra: '24', naziv: 'Staklorezački radovi',       grupa: 'zavrsni' },
  // ── OSTALE STRUKE (van građevinsko-zanatskih; svrstane u svoje strukе, ne prikazuju se u ova tri podnaslova) ──
  { sifra: '15', naziv: 'Sanitarni uređaji' },
  { sifra: '16', naziv: 'Vodovod i kanalizacija' },
  { sifra: '17', naziv: 'Elektroinstalacije' },
  { sifra: '18', naziv: 'Mašinske instalacije' },
  { sifra: '19', naziv: 'Vanjsko uređenje' },
  { sifra: '25', naziv: 'Protivpožarna zaštita' },
]
const REDOSLIJED_MAP = new Map(REDOSLIJED_KATEGORIJA.map((r, i) => [r.naziv, i]))
const GRUPA_MAP = new Map(REDOSLIJED_KATEGORIJA.map(r => [r.naziv, r.grupa]))
// Broj kategorije (prefiks šifre, npr. '01', '04') za prikaz uz naziv u padajućem meniju —
// ista numeracija koja se koristi u šiframa pozicija unutar te kategorije (npr. 04.01.001).
const SIFRA_KATEGORIJE_MAP = new Map(REDOSLIJED_KATEGORIJA.map(r => [r.naziv, r.sifra]))

// Kategorije su statička, ručno napisana lista (REDOSLIJED_KATEGORIJA) — dostupna ODMAH,
// nezavisno od toga da li je baza.js (467 KB) već stigla sa servera. Ovo je namjerno:
// baza se sad učitava lijeno (vidi useEffect u App komponenti niže), pa kategorije ne smiju
// čekati taj fajl da bi se dropdown filteri prikazali korisniku bez kašnjenja.
const KATEGORIJE = REDOSLIJED_KATEGORIJA.map(r => r.naziv)

// ── SORTIRANJE GRUPA RADOVA PO NUMERACIJI KATEGORIJA ──
// Predefinisane grupe (vezane za kategoriju iz REDOSLIJED_KATEGORIJA) slažu se po istom
// redoslijedu kao padajući meni (01, 02, 03…), bez obzira kojim su redom dodate — pa kad
// korisnik naknadno ubaci zaboravljenu grupu, ona sama sjedne na svoje mjesto. Prilagođene
// (custom) grupe nemaju vezanu kategoriju i idu na KRAJ, čuvajući međusobni redoslijed dodavanja.
const poredakFaze = f => {
  const k = f && f.kategorija
  if (k && REDOSLIJED_MAP.has(k)) return REDOSLIJED_MAP.get(k)
  return 10000 + (f?.redoslijed ?? 0)
}
const sortirajFaze = arr => [...(arr || [])].sort((a, b) => poredakFaze(a) - poredakFaze(b))

// Kanonske mjerne jedinice za padajuće menije (isti spisak koji koristi tabela pozicija).
const JEDINICE_OPCIJE = ['m²', 'm³', 'm', 'kom.', 'pau.', 'kg', 't', 'l', 'h', 'dan', 'voz', 'm²/dan']

// Mapiranje postojećih kategorija baze na strukе (danas samo hidro-podskup je izdvojen,
// sve ostalo pripada građevinsko-zanatskim radovima; kad se dodaju baze za elektro/mašinstvo/
// vanjsko uređenje, njihove kategorije se samo dodaju ovdje)
const KATEGORIJA_STRUKA = {
  'Vodovod i kanalizacija': 'hidro',
  'Sanitarni uređaji': 'hidro',
  'Elektroinstalacije': 'elektro',
  'Mašinske instalacije': 'masinski',
  'Vanjsko uređenje': 'vanjsko',
}
const strukaZaKategoriju = k => KATEGORIJA_STRUKA[k] || 'gradjevinski'
const DEFAULT_STRUKE = [
  { kod: 'gradjevinski', naziv: 'Građevinsko-zanatski radovi' },
  { kod: 'hidro',        naziv: 'Hidrotehnička instalacija' },
  { kod: 'elektro',      naziv: 'Elektroinstalacije' },
  { kod: 'masinski',     naziv: 'Mašinske instalacije' },
  { kod: 'vanjsko',      naziv: 'Vanjsko uređenje' },
]

// Pretvori broj u rimski broj (za numeraciju struka u exportu, npr. I, II, III...)
const toRoman = n => {
  const vals = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
  let res = '', num = n
  for (const [v, s] of vals) { while (num >= v) { res += s; num -= v } }
  return res
}

// Deterministički format brojeva po RS/BiH konvenciji: tačka za hiljade, zarez za decimale
// (npr. 23.312,30). NE oslanja se na toLocaleString('bs-BA') jer taj u nekim okruženjima (npr.
// print engine bez potpune ICU baze za bs-BA) tiho pada na engleski format (23,312.30) — što je
// i bio uzrok pogrešnog prikaza. Ovako je rezultat isti svuda: ekran, PDF, svaki preglednik.
const fmt = n => {
  const num = Number(n) || 0
  const neg = num < 0 ? '-' : ''
  const [cijeli, dec] = Math.abs(num).toFixed(2).split('.')
  return neg + cijeli.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}

// ── NORMALIZACIJA JEDINICE MJERE U KANONSKI OBLIK DROPDOWN-A ──
// baza.js (izvorna baza od 1.091 stavke) koristi PUNE RIJEČI ("Paušalno", "Kom.", "Čas") koje
// se nikad nisu poklapale sa skraćenicama u padajućem meniju ("pau.", "kom.", "h") — otkriveno
// auditom jul 2026, pogađa ~295 od 1.091 stavki (27%). Bez ove normalizacije dropdown tiho
// pada na prvu opciju ("m²") čak i kad je stvarna jedinica u bazi bila potpuno tačna, samo
// zapisana drugačije. Audit NIJE pronašao stvarna neslaganja teksta opisa i jedinice u samoj
// bazi — baza.js se ne mijenja, sve se rješava normalizacijom ovdje pri prikazu i upisu.
// m1/m¹ se svodi na običnu "m" (dogovoreno sa Aleksandrom, jul 2026 — u praksi se dužni metar
// piše prosto kao "m").
const fmtJmj = j => {
  const t = (j || '').trim()
  const punaRijec = {
    'm¹': 'm', 'm1': 'm', 'm2': 'm²', 'm3': 'm³', 'M2': 'M²', 'M3': 'M³',
    'Kom.': 'kom.', 'Kom': 'kom.', 'kom': 'kom.',
    'Paušalno': 'pau.', 'paušalno': 'pau.', 'Pausalno': 'pau.', 'pausalno': 'pau.',
    'Čas': 'h', 'čas': 'h', 'Cas': 'h', 'cas': 'h', 'Sat': 'h', 'sat': 'h',
  }
  if (punaRijec[t]) return punaRijec[t]
  // Preostali slučajevi (m², m³, kg, t, l, dan, voz, m²/dan...) su već u kanonskom obliku —
  // regex ispod hvata samo ASCII m2/m3/m1 zapise koji nisu bili uhvaćeni tačnim poklapanjem gore.
  return t.replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³').replace(/m1\b/g, 'm').replace(/m¹/g, 'm').replace(/M2\b/g, 'M²').replace(/M3\b/g, 'M³')
}

// ── PREPOZNAVANJE JEDINICE IZ TEKSTA OPISA (za ručni unos i AI generisanje, NE za baza.js) ──
// Traži se u završnoj "Obračun po..." klauzuli (standardni obrazac u ovim opisima — vidi i
// SYSTEM_PROMPT u AIAsistent.jsx: "Na kraju stavke uvijek napiši 'Obračun po [jed.mjere].'"),
// ne u cijelom tekstu — jednoslovne jedinice (t, l, h, m) bi inače lako pogrešno pogodile neku
// slučajnu riječ usred dugog opisa. "(?<!m)" ispred m²/m³ obrazaca sprečava lažni pogodak na
// "mm²" (kvadratni milimetar, npr. presjek kabla) koji NIJE ista jedinica kao "m²".
// NAMJERNO se ne koristi za stavke iz baze.js/Moja baza — audit (jul 2026) je pokazao da je
// jedinica upisana u samoj bazi pouzdanija od ovog teksta-detektora (koji ima lažne pogotke na
// složenijim, profesionalno pisanim opisima); za te izvore koristi se samo fmtJmj normalizacija.
const prepoznajJedinicu = tekst => {
  if (!tekst) return null
  if (/pau[šs]al/i.test(tekst)) return 'pau.'
  // Traži POSLJEDNJU pojavu riječi "obračun" (ne prvu) — opis nekad spomene "obračun" i ranije
  // u tekstu usput, a stvarna klauzula sa jedinicom je uvijek na samom kraju. Uzimanje teksta
  // tek od POSLJEDNJE pojave drži klauzulu kratkom i preciznom — bitno za jednoslovne skraćenice
  // (t, l, h, m) koje bi inače lakše lažno pogodile nešto slučajno usred dužeg opisa.
  const svaPojavljivanja = [...tekst.matchAll(/obra[čc]un/gi)]
  const klauzulaSirova = svaPojavljivanja.length > 0
    ? tekst.slice(svaPojavljivanja[svaPojavljivanja.length - 1].index)
    : tekst
  const klauzula = klauzulaSirova.toLowerCase()

  const imaM2 = /(?<!m)m\s*2\b|(?<!m)m²|kvadratn/i.test(klauzula)
  const imaM3 = /(?<!m)m\s*3\b|(?<!m)m³|kubn/i.test(klauzula)
  const imaDan = /\bdan\w*\b/i.test(klauzula)

  // Složena jedinica "m²/dan" (zauzeće javne površine po danu) — provjerava se PRIJE običnog
  // m², jer se oba pojma obično navode zajedno ("obračun po m²/dan zauzete površine").
  if (imaM2 && imaDan) return 'm²/dan'
  if (imaM2) return 'm²'
  if (imaM3) return 'm³'
  if (/\bkom\.?\b|komad/i.test(klauzula)) return 'kom.'
  if (/\bkg\b|kilogram/i.test(klauzula)) return 'kg'
  // Skraćenice t/l/h se prepoznaju i kao samostalno slovo (npr. "Obračun po t.") i kao puna
  // riječ KROZ SVE PADEŽE — \w* hvata bilo koji nastavak poslije korijena (tona/tone/toni/
  // tonu/tonom, litar/litra/litru/litrom, sat/sata/satu/satom, čas/časa/času/časom), ne samo
  // nominativ kako je bilo ranije.
  if (/\bton\w*|\bt\b/i.test(klauzula)) return 't'
  if (/\blitr\w*|\bl\b/i.test(klauzula)) return 'l'
  if (/\bsat\w*|\bčas\w*|\bcas\w*|\bh\b/i.test(klauzula)) return 'h'
  if (imaDan) return 'dan'
  // "Voz" (kamion/vozilo šuta i sl.) — npr. "obračun po vozilu", "obračun po vozu"
  if (/\bvoz\w*/i.test(klauzula)) return 'voz'
  if (/\bm\s*1\b|m¹|dužn\w*\s*metar|duzn\w*\s*metar|\bm\b/i.test(klauzula)) return 'm'
  return null
}

// Automatski prilagođava visinu textarea elementa sadržaju — poziva se na SVAKI unos teksta
// (uključujući Enter), tako da ćelija "raste" ispred korisnika dok piše, umjesto da tekst
// nestane iznad vidljivog dijela dok se ručno ne pokrene ponovno mjerenje (npr. dvoklikom).
// Trik sa privremenim spuštanjem rows na 1 i height na 'auto' je neophodan da bi scrollHeight
// izmjerio STVARNU potrebnu visinu sadržaja, ne visinu koju bi nametnuo rows atribut.
const autoGrowTextarea = (el) => {
  if (!el) return 0
  const originalRows = el.rows
  el.rows = 1
  el.style.height = 'auto'
  const potrebno = Math.max(el.scrollHeight + 6, 40)
  el.rows = originalRows
  el.style.height = potrebno + 'px'
  return potrebno
}

// Smanji/optimizuj upload-ovanu sliku loga prije čuvanja u bazu (max širina 360px)
const resizeSlika = (file, maxW = 360) => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) { reject(new Error('Fajl mora biti slika.')); return }
  const reader = new FileReader()
  reader.onload = e => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Greška pri učitavanju slike.'))
    img.src = e.target.result
  }
  reader.onerror = () => reject(new Error('Greška pri čitanju fajla.'))
  reader.readAsDataURL(file)
})
const calcRow = (p, svePoz) => {
  // Ako stavka ima podstavke, ukupno je zbir podstavki
  if (svePoz) {
    const djeca = svePoz.filter(d => d.parent_id === p.id)
    if (djeca.length > 0) return djeca.reduce((s, d) => s + calcRowSimple(d), 0)
  }
  return calcRowSimple(p)
}
const calcRowSimple = p => (parseFloat(p.kolicina) || 0) * (parseFloat(p.cijena) || 0)
const calcFaza = f => (f.pozicije || []).reduce((s, p) => s + calcRow(p, pozicije), 0)

// ── SEARCH PANEL ──────────────────────────────────
function BazaPanel({ onAdd, onAddFromMojaBaza, mojeBazaStavke, aktivnaStruka, strukaNaziv, baza, bazaUcitavanje, onDodajVlastitu, zamjenaNaziv, onOtkaziZamjenu, zakljucanaKategorija }) {
  const [q, setQ] = useState('')
  const [kat, setKat] = useState('')
  const [tab, setTab] = useState('glavna') // glavna | moja
  const [prikaziRezultate, setPrikaziRezultate] = useState(true) // sakrij/prikaži listu rezultata baze
  const [mojaGrupa, setMojaGrupa] = useState('') // izabrana grupa u "Moja baza" tabu (samo postojeće grupe)
  // Grupe koje STVARNO postoje u korisnikovoj Mojoj bazi (iz kategorija njegovih stavki) — bez
  // cijelog šifarnika i bez opcije „sve". Poredane po numeraciji, nepoznate/„Moje stavke" na kraj.
  const mojeGrupe = useMemo(() => {
    const s = new Set(mojeBazaStavke.map(x => x.kategorija || 'Moje stavke'))
    return [...s].sort((a, b) => ((REDOSLIJED_MAP.get(a) ?? 999) - (REDOSLIJED_MAP.get(b) ?? 999)) || a.localeCompare(b))
  }, [mojeBazaStavke])
  useEffect(() => { if (mojaGrupa && !mojeGrupe.includes(mojaGrupa)) setMojaGrupa('') }, [mojeGrupe])

  // Prilagođene (korisnički dodane) faze nemaju unaprijed poznato mapiranje kategorija baze,
  // pa im NE ograničavamo pretragu — vide cijelu bazu i sami biraju šta je relevantno.
  const jePoznataStruka = ['gradjevinski','hidro','elektro','masinski','vanjsko'].includes(aktivnaStruka)

  // Kategorije i broj stavki relevantni za trenutno aktivnu strukу (ili sve, ako je prilagođena faza)
  const kategorijeZaStruku = useMemo(() => jePoznataStruka ? KATEGORIJE.filter(k => strukaZaKategoriju(k) === aktivnaStruka) : KATEGORIJE, [aktivnaStruka, jePoznataStruka])
  const brojUStruci = useMemo(() => jePoznataStruka ? baza.reduce((n, item) => n + (strukaZaKategoriju(item.k) === aktivnaStruka ? 1 : 0), 0) : baza.length, [baza, aktivnaStruka, jePoznataStruka])

  // Reset kategorije filtera ako više ne pripada aktivnoj struci (npr. korisnik promijeni fazu)
  useEffect(() => { if (kat && !kategorijeZaStruku.includes(kat)) setKat('') }, [aktivnaStruka])

  // Zaključavanje filtera na predefinisanu grupu: ako je aktivna grupa vezana za kategoriju iz
  // šifarnika, centralni filter se forsira na tu kategoriju (ostale su zasivljene). Kad je aktivna
  // prilagođena (custom) grupa — zakljucanaKategorija je prazna — filter se otključava i vraća na
  // „Sve kategorije", pa korisnik slobodno bira. Efekat se pokreće samo kad se grupa PROMIJENI.
  useEffect(() => { setKat(zakljucanaKategorija || '') }, [zakljucanaKategorija])

  const rezultati = useMemo(() => {
    // "Moja baza" tab: filtriranje po IZABRANOJ grupi (ne po tekstu). Prikazuju se sve stavke te
    // grupe. Ako nijedna grupa nije izabrana (prazna baza), nema rezultata.
    if (tab === 'moja') {
      const terms = q.trim().length >= 2 ? q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1) : []
      return mojeBazaStavke
        .filter(s => !mojaGrupa || (s.kategorija || 'Moje stavke') === mojaGrupa)
        .filter(s => terms.every(t => s.naziv.toLowerCase().includes(t)))
        .map(s => ({ n: s.naziv, c: s.cijena, m: s.jedinica, k: s.kategorija || 'Moje stavke', v: s.valuta, _moja: true, _id: s.id }))
    }
    const imaTekst = q.trim().length >= 2
    const imaKategoriju = !!kat
    if (!imaTekst && !imaKategoriju) return []
    const terms = imaTekst ? q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1) : []
    const out = []
    const limit = imaTekst ? 80 : 200
    for (let i = 0; i < baza.length && out.length < limit; i++) {
      const item = baza[i]
      if (jePoznataStruka && strukaZaKategoriju(item.k) !== aktivnaStruka) continue
      if (kat && item.k !== kat) continue
      const n = item.n.toLowerCase()
      const s = (item.s || '').toLowerCase()
      if (terms.length === 0 || terms.every(t => n.includes(t) || s.includes(t))) out.push({ ...item, _idx: i })
    }
    return out
  }, [q, kat, tab, mojaGrupa, mojeBazaStavke, aktivnaStruka, baza])

  const grouped = useMemo(() => {
    const g = {}
    for (const r of rezultati) {
      const k = r.k || 'Moje stavke'
      if (!g[k]) g[k] = []
      g[k].push(r)
    }
    return g
  }, [rezultati])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#E4E9EE', maxHeight: 280, flexShrink: 0 }}>
      {zamjenaNaziv && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: '#FFF3D6', borderBottom: '1px solid #C9954E', fontSize: 12, color: '#8A6524' }}>
          <span>🔁 Birate zamjenu za: <strong>{zamjenaNaziv}</strong> — kliknite stavku ispod da je zamijeni</span>
          <div style={{ flex: 1 }}></div>
          <button onClick={onOtkaziZamjenu}
            style={{ background: 'transparent', border: '1px solid #C9954E', borderRadius: 6, color: '#8A6524', cursor: 'pointer', fontSize: 11, padding: '3px 8px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Otkaži
          </button>
        </div>
      )}
      {/* Tabovi */}
      <div style={{ display: 'flex', borderBottom: '1px solid #D2DCE6', background: '#E4E9EE' }}>
        {[['glavna', `📚 Baza (${bazaUcitavanje ? 'učitavam...' : brojUStruci.toLocaleString('bs-BA')})`], ['moja', `⭐ Moja baza (${mojeBazaStavke.length})`]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', fontSize: 12, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1B2F43' : '#666', borderBottom: tab === t ? '2px solid #1B2F43' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Search / izbor grupe */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #D2DCE6', background: '#E4E9EE' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          spellCheck={false}
          placeholder={tab === 'glavna' ? '🔍 Pretražite bazu... (iskop, beton, malter...)' : '🔍 Pretražite vaše stavke...'}
          disabled={tab === 'glavna' && (bazaUcitavanje || brojUStruci === 0)}
          style={{ flex: 1, border: '1px solid #C2CDD8', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: (tab === 'glavna' && (bazaUcitavanje || brojUStruci === 0)) ? '#DCE0E3' : '#fff' }} />
        {tab === 'moja' && mojeGrupe.length > 0 && (
          <select value={mojaGrupa} onChange={e => setMojaGrupa(e.target.value)}
            title="Prikaži stavke izabrane grupe iz vaše baze"
            style={{ border: '1px solid #C2CDD8', borderRadius: 6, padding: '7px', fontSize: 12, fontFamily: 'inherit', minWidth: 150, maxWidth: 220, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', background: '#fff', cursor: 'pointer' }}>
            <option value="">— Sve moje grupe —</option>
            {mojeGrupe.map(g => <option key={g} value={g}>{(SIFRA_KATEGORIJE_MAP.get(g) ? SIFRA_KATEGORIJE_MAP.get(g) + ' · ' : '') + g}</option>)}
          </select>
        )}
        {tab === 'glavna' && !bazaUcitavanje && brojUStruci > 0 && (
          <select value={kat} onChange={e => setKat(e.target.value)}
            disabled={!!zakljucanaKategorija}
            title={zakljucanaKategorija ? 'Kategorija je zaključana na aktivnu grupu radova. Za slobodan izbor koristite prilagođenu grupu.' : undefined}
            style={{ border: '1px solid #C2CDD8', borderRadius: 6, padding: '7px', fontSize: 12, fontFamily: 'inherit', minWidth: 150, maxWidth: 220, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', background: zakljucanaKategorija ? '#E7EBEF' : '#fff', color: zakljucanaKategorija ? '#556575' : 'inherit', cursor: zakljucanaKategorija ? 'not-allowed' : 'pointer' }}>
            <option value="">— Sve kategorije —</option>
            {jePoznataStruka ? (
              aktivnaStruka === 'gradjevinski' ? (
                <>
                  <optgroup label="Pripremni radovi i rušenje">
                    {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'pripremni').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                  </optgroup>
                  <optgroup label="Grubi građevinski radovi">
                    {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'grubi').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                  </optgroup>
                  <optgroup label="Završni građevinsko-zanatski radovi">
                    {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'zavrsni').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                  </optgroup>
                </>
              ) : (
                kategorijeZaStruku.map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)
              )
            ) : (
              // Vlastita (prilagođena) faza — pristup kompletnoj bazi: građevinsko-zanatski dio
              // zadržava istu podjelu na tri podnaslova, a svaka od preostalih kategorija
              // (Sanitarni, Vodovod, Elektro, Mašinske, Vanjsko, Protivpožarna) prikazuje se
              // kao svoj vlastiti bold podnaslov, uočljivo odvojen, s jednom stavkom ispod.
              <>
                <optgroup label="Pripremni radovi i rušenje">
                  {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'pripremni').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                </optgroup>
                <optgroup label="Grubi građevinski radovi">
                  {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'grubi').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                </optgroup>
                <optgroup label="Završni građevinsko-zanatski radovi">
                  {kategorijeZaStruku.filter(k => GRUPA_MAP.get(k) === 'zavrsni').map(k => <option key={k} value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>)}
                </optgroup>
                {kategorijeZaStruku.filter(k => !GRUPA_MAP.get(k)).map(k => (
                  <optgroup key={k} label={k}>
                    <option value={k}>{SIFRA_KATEGORIJE_MAP.get(k) || ''} · {k}</option>
                  </optgroup>
                ))}
              </>
            )}
          </select>
        )}
        <button onClick={onDodajVlastitu} title="Dodaj praznu, vlastitu stavku direktno u predmjer"
          style={{ background: '#556575', color: '#fff', border: 'none', borderRadius: 6, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
          + Vlastita stavka
        </button>
        {q && <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>×</button>}
      </div>

      {/* Rezultati */}
      <div style={{ overflowY: 'auto', flex: prikaziRezultate ? 1 : 'none' }}>
        {tab === 'glavna' && bazaUcitavanje ? (
          <div style={{ padding: '18px 16px', textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>⏳ Učitavam bazu pozicija...</div>
          </div>
        ) : tab === 'glavna' && brojUStruci === 0 ? (
          <div style={{ padding: '18px 16px', textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 4 }}>Baza za "{strukaNaziv}" još nije dostupna</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>Za sada dodajte pozicije preko <strong>"+ Vlastita stavka"</strong> ili AI asistenta ✨. Baza za ovu fazu će biti dodana naknadno.</div>
          </div>
        ) : (tab === 'glavna' && q.trim().length < 2 && !kat) ? (
          <div style={{ padding: '8px 14px', fontSize: 12, color: '#aaa' }}>
            Unesite pojam za pretragu (npr: "iskop", "beton", "malter"...) ili izaberite kategoriju da vidite sve stavke
          </div>
        ) : rezultati.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: '#888', fontSize: 13 }}>{tab === 'moja' && mojeGrupe.length === 0 ? 'Vaša baza je prazna — dodajte stavke kroz „Upravljaj mojom bazom".' : q.trim() ? `Nema rezultata za "${q}"` : 'Nema stavki u ovoj kategoriji'}</div>
        ) : (
          <>
            <div onClick={() => setPrikaziRezultate(v => !v)}
              title={prikaziRezultate ? 'Sakrij listu rezultata' : 'Prikaži listu rezultata'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 11, color: '#4C5E6E', background: '#f0f0ee', borderBottom: '1px solid #E0DDD5', cursor: 'pointer', userSelect: 'none', fontWeight: 600, position: 'sticky', top: 0, zIndex: 2 }}>
              <span style={{ fontSize: 10, transition: 'transform .15s', transform: prikaziRezultate ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              <span style={{ flex: 1 }}>{rezultati.length} rezultata{prikaziRezultate ? ' — kliknite na poziciju da je dodate' : ''}</span>
              <span style={{ fontSize: 10.5, color: '#8A94A0', fontWeight: 500 }}>{prikaziRezultate ? 'sakrij' : 'prikaži'}</span>
            </div>
            {prikaziRezultate && Object.entries(grouped).map(([k, items]) => (
              <div key={k}>
                <div style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6860', background: '#F5F4F0', position: 'sticky', top: 27 }}>{k}</div>
                {items.map((item, i) => (
                  <div key={i} onClick={() => item._moja ? onAddFromMojaBaza(item) : onAdd(item._idx)}
                    style={{ padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid #EEECEA' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#E8ECF0'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    {item.s && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8A94A0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', minWidth: 68 }}>{item.s}</span>
                    )}
                    <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{item.n}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1B2F43', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {item.c > 0 ? fmt(item.c) + ' €' : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>/{fmtJmj(item.m)}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Baza pozicija (467 KB) — lijeno učitana tek nakon prijave, ne dio glavnog JS bundle-a.
  // Vidi useEffect niže ("Lijeno učitavanje baze pozicija") za mehanizam.
  const [baza, setBaza] = useState([])
  const [bazaUcitavanje, setBazaUcitavanje] = useState(true)

  // Podaci
  const [projekti, setProjekti] = useState([])
  const [aktivniProjekat, setAktivniProjekat] = useState(null)
  const [faze, setFaze] = useState([])
  const [aktivnaFaza, setAktivnaFaza] = useState(null)
  const [pozicije, setPozicije] = useState([]) // sve pozicije aktivne faze
  const [mojeBaza, setMojaBaza] = useState([])

  // UI stanja
  const [noviProjekat, setNoviProjekat] = useState('')
  const [novaFaza, setNovaFaza] = useState('')
  const [showMojaBaza, setShowMojaBaza] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showUputstvo, setShowUputstvo] = useState(false)
  // Prikaz uređivača opštih uslova aktivne grupe radova (sklopivo — sakriveno po defaultu da
  // ne zauzima prostor dok korisniku ne zatreba)
  const [showUslovi, setShowUslovi] = useState(false)
  const [exportMeni, setExportMeni] = useState(null) // null | 'excel' | 'pdf'
  const [valuta, setValuta] = useState('EUR') // EUR | KM | RSD | USD
  const [revizija, setRevizija] = useState(0) // brojač koji se povećava samo pri AI grupnim izmjenama (forsira osvježenje polja)

  const VALUTE = [
    { kod: 'EUR', znak: '€', naziv: 'Euro' },
    { kod: 'KM',  znak: 'KM', naziv: 'Kon. marka' },
    { kod: 'RSD', znak: 'din', naziv: 'Dinar' },
    { kod: 'USD', znak: '$', naziv: 'Dolar' },
  ]
  const valutaZnak = VALUTE.find(v => v.kod === valuta)?.znak || '€'

  // Kursevi — koliko 1 EUR vrijedi u toj valuti. KM je fiksno vezan za EUR (1,95583, valutni
  // odbor — taj odnos se ne mijenja). RSD i USD se automatski povlače sa /api/kurs (vidi
  // useEffect ispod) sa zvaničnih izvora (NBS za RSD, ECB/Frankfurter za USD) i keširaju 24h
  // u bazi. Vrijednosti ovdje su samo POČETNE/rezervne — dok se pravi kurs ne učita, ili ako
  // povlačenje ikad zakaže (nikad ne blokira rad aplikacije).
  const [KURSEVI, setKURSEVI] = useState({ EUR: 1, KM: 1.95583, RSD: 117.34, USD: 1.1437 })
  const [kursDatum, setKursDatum] = useState(null) // datum zadnjeg stvarnog osvježenja kursa (prikaz korisniku)
  useEffect(() => {
    if (!session?.access_token) return
    fetch('/api/kurs', { headers: { 'Authorization': `Bearer ${session.access_token}` } })
      .then(r => r.json())
      .then(data => {
        if (data?.kursevi) {
          setKURSEVI(prev => ({ ...prev, ...data.kursevi }))
          const datumi = [data.datumUSD, data.datumRSD].filter(Boolean)
          if (datumi.length) setKursDatum(datumi.sort().pop())
        }
      })
      .catch(e => console.error('Kurs valute nije učitan, koristim rezervne vrijednosti:', e.message))
  }, [session])
  const konvertujCijenu = (iznos, izValute, uValutu) => {
    if (izValute === uValutu) return iznos
    const uEUR = iznos / (KURSEVI[izValute] || 1)
    return uEUR * (KURSEVI[uValutu] || 1)
  }
  const [kloniranjeLoading, setKloniranjeLoading] = useState(false)
  const [uvozLoading, setUvozLoading] = useState(false)
  const uvozInputRef = React.useRef(null)
  // Ref na polje "Novi projekat..." u sidebaru — koristi se da centralni ekran za izbor
  // projekta (kad nijedan projekat nije aktivan) može fokusirati baš OVO polje umjesto da
  // duplira logiku unosa/kreiranja projekta na dva mjesta.
  const noviProjekatInputRef = React.useRef(null)
  // Sprečava preklapajuće pozive dodavanja pozicije (npr. brz dupli klik na istu ili različitu
  // "dodaj stavku" akciju) — broj pozicije (redoslijed) se računa iz trenutnog stanja na
  // ekranu, pa dva gotovo istovremena poziva mogu pročitati ISTI "trenutni max" prije nego što
  // ijedan stigne da upiše svoju stavku, i tako dobiti isti broj. Ovaj ref to sprečava tako što
  // odbija novi poziv dok prethodni još traje.
  const dodavanjeUTokuRef = React.useRef(false)
  const [firma, setFirma] = useState(null) // { naziv, logo } - postavke firme (logo/naziv) vezane za nalog
  const [showFirmaModal, setShowFirmaModal] = useState(false)
  const [firmaLoading, setFirmaLoading] = useState(false)
  const [aktivnaStruka, setAktivnaStruka] = useState('gradjevinski')
  const [editStrukaKod, setEditStrukaKod] = useState(null) // kod struke koja se trenutno preimenuje
  const [editFazaNazivMjesto, setEditFazaNazivMjesto] = useState(null) // null | 'toolbar' — da li se trenutno preimenuje aktivna grupa radova (jedino mjesto za to je traka na vrhu; sidebar linija je uklonjena kao suvišna)
  const [dodajStrukuMod, setDodajStrukuMod] = useState(false) // da li je otvoreno polje za unos nove struke
  const [zamjenaPozicijaId, setZamjenaPozicijaId] = useState(null) // ID glavne stavke koja čeka da bude zamijenjena novom iz baze (klik na "🔁")
  // Skraćivanje dugih opisa NA EKRANU (preglednost). Duge pozicije se prikazuju skraćeno (~3 reda);
  // klik u polje (fokus) ih razvije radi čitanja/uređivanja, a klik van polja (blur) ih sam skupi.
  // Ovo je čisto vizuelno — PDF i Excel izvoz UVIJEK koriste pun opis (grade se iz p.naziv).
  const [prosireniOpisi, setProsireniOpisi] = useState(() => new Set())
  const jeDugOpis = p => ((p?.naziv || '').length > 180) || (p?.opis_visina && p.opis_visina > 92)
  const prosiriOpis = id => setProsireniOpisi(prev => { const n = new Set(prev); n.add(id); return n })
  const skupiOpis = id => setProsireniOpisi(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n })
  const toggleOpis = id => setProsireniOpisi(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Undo brisanja pozicije — pamti posljednju obrisanu stavku (i njene podstavke ako ih je imala)
  // radi kratkotrajne mogućnosti vraćanja ("Opozovi" traka pri dnu ekrana). Samo jedan nivo undo-a
  // (posljednje brisanje), ne pun stog — isto ograničenje kao i undo AI grupnih izmjena.
  const [otkazivanjeBrisanja, setOtkazivanjeBrisanja] = useState(null) // { poz, djeca, timeoutId }

  // Undo posljednjih izmjena polja (cijena, količina, naziv, šifra, jedinica) — stog do 20 izmjena
  // unutar trenutne sesije. Ne pamti opis_visina (to je sporedna posljedica auto-grow ćelije,
  // ne stvarna korisnikova izmjena, pa ne bi trebalo da zatrpava undo stog).
  const [istorijaIzmjena, setIstorijaIzmjena] = useState([]) // [{id, polje, staraVrijednost, novaVrijednost}]

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Lijeno učitavanje baze pozicija — pokreće se tek kad postoji aktivna sesija, asinhrono,
  // paralelno sa učitavanjem projekata (ne blokira inicijalni render aplikacije). Koristi
  // standardni ES modul dinamički import(), koji Vite prepoznaje i pretvara u zaseban fajl
  // preuzet na zahtjev, umjesto da bude "zapečen" u glavni JS bundle koji se učita odmah.
  // Dependency je !!session (boolean), ne cijeli session objekat, da se ovo ne ponavlja
  // nepotrebno pri svakoj promjeni session reference (npr. refresh tokena).
  useEffect(() => {
    if (!session) return
    let otkazano = false
    import('./baza.js').then(mod => {
      if (otkazano) return
      try {
        // atob() sam tretira svaki bajt kao Latin-1 karakter, što lomi UTF-8 slova (č,ć,š,ž,đ).
        // TextDecoder ispravno sastavlja višebajtne UTF-8 sekvence nazad u prava slova.
        const dekodirano = JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob(mod.BAZA_B64), c => c.charCodeAt(0))))
        setBaza(dekodirano)
      } catch (e) {
        console.error('Greška pri dekodiranju baze pozicija:', e)
      }
      setBazaUcitavanje(false)
    }).catch(e => {
      console.error('Greška pri učitavanju baze pozicija:', e)
      if (!otkazano) setBazaUcitavanje(false)
    })
    return () => { otkazano = true }
  }, [!!session])

  // Učitaj projekte, moju bazu i postavke firme kad se korisnik prijavi
  useEffect(() => {
    if (session) {
      ucitajProjekte()
      ucitajMojuBazu()
      ucitajFirmu()
    }
  }, [session])

  // Učitaj faze kad se promijeni projekat
  useEffect(() => {
    if (aktivniProjekat) {
      let struke = aktivniProjekat.struke || DEFAULT_STRUKE
      // Migracija starih projekata: ako postoji stara projekt-nivo vrijednost uvećanja/umanjenja
      // a nijedna struka još nema svoju vlastitu, prebaci staru vrijednost na prvu (glavnu) struku
      // kako korisnik ne bi izgubio već podešenu korekciju prelaskom na po-struci logiku.
      const staroUvecanje = aktivniProjekat.uvecanje_pct ?? ((aktivniProjekat.uv_radovi || 0) + (aktivniProjekat.uv_materijal || 0))
      const staroUmanjenje = aktivniProjekat.umanjenje_pct ?? ((aktivniProjekat.um_radovi || 0) + (aktivniProjekat.um_materijal || 0))
      const nijednaStrukaNemaVlastitu = struke.every(s => s.uvecanjePct == null && s.umanjenjePct == null)
      if (nijednaStrukaNemaVlastitu && (staroUvecanje > 0 || staroUmanjenje > 0) && struke.length > 0) {
        struke = struke.map((s, i) => i === 0 ? { ...s, uvecanjePct: staroUvecanje, umanjenjePct: staroUmanjenje } : s)
        supabase.from('projekti').update({ struke }).eq('id', aktivniProjekat.id).then(() => {})
      }
      // Otvori projekat na FAZI/GRUPI RADOVA gdje je korisnik posljednji put stao u OVOM
      // projektu — ne uvijek na prvoj. "zadnja_struka_kod" pamti posljednju aktivnu strukу
      // (kolona na projektu), a "zadnjaFazaId" unutar same struke (u JSON polju struke) pamti
      // posljednju grupu radova koja je bila otvorena baš u toj struci. Ako ništa nije zapamćeno
      // (stariji projekat, ili prvi ulazak), pada nazad na prvu strukу — staro ponašanje.
      const pocetnaStruka = (aktivniProjekat.zadnja_struka_kod && struke.some(s => s.kod === aktivniProjekat.zadnja_struka_kod))
        ? aktivniProjekat.zadnja_struka_kod
        : (struke[0]?.kod || 'gradjevinski')
      setAktivnaStruka(pocetnaStruka)
      const zapamcenaFazaId = struke.find(s => s.kod === pocetnaStruka)?.zadnjaFazaId || null
      ucitajFaze(aktivniProjekat.id, pocetnaStruka, zapamcenaFazaId)
      setPozicije([])
      // Vrati stvarnu valutu OVOG projekta (u kojoj su cijene stvarno upisane), ne uvijek EUR
      setValuta(aktivniProjekat.valuta || 'EUR')
    }
  }, [aktivniProjekat?.id])

  // Učitaj pozicije kad se promijeni faza
  useEffect(() => {
    if (aktivnaFaza) ucitajPozicije(aktivnaFaza.id)
    else setPozicije([])
    setEditFazaNazivMjesto(null)
    setZamjenaPozicijaId(null)
  }, [aktivnaFaza])

  // KLJUČNO: resetuj undo-stog (izmjene polja) i traku za opoziv brisanja svaki put kad se
  // promijeni aktivna grupa radova. Undo zapisi referenciraju konkretne ID-jeve pozicija iz
  // TE grupe radova — ako korisnik pređe na drugu fazu ili drugi (npr. klonirani) projekat bez
  // ovog resetovanja, stari zapis u stogu bi mogao tiho izmijeniti podatke u projektu/fazi koju
  // korisnik više ne gleda, umjesto u onoj koja je trenutno na ekranu (npr. "Opozovi" u kloniranom
  // projektu bi mogao vratiti izmjenu koja zapravo pripada originalnom dokumentu).
  useEffect(() => {
    setIstorijaIzmjena([])
    setOpozivUslova(null)
    setOtkazivanjeBrisanja(prev => {
      if (prev?.timeoutId) clearTimeout(prev.timeoutId)
      return null
    })
  }, [aktivnaFaza?.id])

  const ucitajProjekte = async () => {
    const { data, error } = await supabase.from('projekti').select('*').order('azuriran_at', { ascending: false })
    if (error) { console.error('Greška pri učitavanju projekata:', error); alert('Greška pri učitavanju liste projekata: ' + error.message) }
    setProjekti(data || [])
    // NAMJERNO: ne bira se automatski prvi projekat. Svaki ulazak u aplikaciju (i svako
    // osvježavanje stranice) treba da prikaže početni ekran za izbor/kreiranje projekta —
    // korisnik uvijek eksplicitno bira sa čim radi, umjesto da aplikacija nagađa umjesto njega.
  }

  const ucitajFaze = async (projektId, pocetnaStruka, zadnjaFazaId = null) => {
    const { data, error } = await supabase.from('faze').select('*').eq('projekat_id', projektId).order('redoslijed')
    if (error) console.error('Greška pri učitavanju grupa radova:', error)
    const uceitaneFaze = sortirajFaze(data || [])
    setFaze(uceitaneFaze)
    // Izaberi grupu radova unutar aktivne struke: prvo pokušaj onu koju je korisnik POSLJEDNJU
    // gledao u ovoj struci (zadnjaFazaId, ako je proslijeđen i još uvijek postoji), a tek ako
    // takva ne postoji (nova struka, obrisana grupa, stariji projekat bez zapamćene vrijednosti)
    // padni nazad na prvu grupu radova — bez ovoga bi korisnik pri svakom ulasku u aplikaciju
    // (ili promjeni struke) morao ručno birati grupu radova prije nego se pozicije prikažu.
    if (pocetnaStruka) {
      const fazeUStruci = uceitaneFaze.filter(f => (f.struka_kod || 'gradjevinski') === pocetnaStruka)
      const zapamcena = zadnjaFazaId ? fazeUStruci.find(f => f.id === zadnjaFazaId) : null
      setAktivnaFaza(zapamcena || fazeUStruci[0] || null)
    }
  }

  const ucitajPozicije = async (fazaId) => {
    const { data, error } = await supabase.from('pozicije').select('*').eq('faza_id', fazaId).order('redoslijed')
    if (error) { console.error('Greška pri učitavanju pozicija:', error); alert('Greška pri učitavanju stavki: ' + error.message) }
    setPozicije(data || [])
  }

  const dodajPodstavku = async (roditeljPoz) => {
    if (!aktivnaFaza || dodavanjeUTokuRef.current) return
    dodavanjeUTokuRef.current = true
    try {
      const { data, error } = await supabase.from('pozicije').insert({
        faza_id: aktivnaFaza.id,
        parent_id: roditeljPoz.id,
        naziv: '',
        jedinica: roditeljPoz.jedinica || 'm²',
        cijena: roditeljPoz.cijena || 0,
        kolicina: 0,
        kategorija: roditeljPoz.kategorija || 'Ostalo',
        redoslijed: pozicije.filter(p => p.parent_id === roditeljPoz.id).length
      }).select().single()
      if (error) { alert('Greška pri dodavanju podstavke: ' + error.message); return }
      if (data) setPozicije(prev => [...prev, data])
    } finally {
      dodavanjeUTokuRef.current = false
    }
  }

  const ucitajMojuBazu = async () => {
    const { data, error } = await supabase.from('moja_baza').select('*').order('kreiran_at', { ascending: false })
    if (error) console.error('Greška pri učitavanju moje baze:', error)
    setMojaBaza(data || [])
  }

  // ── POSTAVKE FIRME (logo/naziv za PDF zaglavlje) ──
  const ucitajFirmu = async () => {
    const { data, error } = await supabase.from('firma_postavke').select('*').eq('user_id', session.user.id).maybeSingle()
    if (error) console.error('Greška pri učitavanju postavki firme:', error)
    setFirma(data || null)
  }

  const sacuvajFirmu = async (logoDataUrl, naziv) => {
    setFirmaLoading(true)
    try {
      const payload = {
        user_id: session.user.id,
        logo: logoDataUrl !== undefined ? logoDataUrl : (firma?.logo || null),
        naziv: naziv !== undefined ? naziv : (firma?.naziv || null),
        updated_at: new Date().toISOString()
      }
      const { data, error } = await supabase.from('firma_postavke').upsert(payload, { onConflict: 'user_id' }).select().single()
      if (error) throw error
      setFirma(data)
    } catch (e) {
      alert('Greška pri čuvanju postavki firme: ' + e.message)
    }
    setFirmaLoading(false)
  }

  const obrisiLogo = async () => {
    if (!confirm('Ukloniti logo firme?')) return
    await sacuvajFirmu(null, undefined)
  }

  // ── PROJEKTI ──
  const dodajProjekat = async () => {
    if (!noviProjekat.trim()) return
    const { data, error } = await supabase.from('projekti').insert({ naziv: noviProjekat.trim() }).select().single()
    if (error) { alert('Greška pri dodavanju projekta: ' + error.message); return }
    if (data) {
      setNoviProjekat('')
      await ucitajProjekte()
      setAktivniProjekat(data)
    }
  }

  const azurirajProjekat = async (polje, vrijednost) => {
    if (!aktivniProjekat) return
    setAktivniProjekat(prev => ({ ...prev, [polje]: vrijednost }))
    setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, [polje]: vrijednost } : p))
    const { error } = await supabase.from('projekti').update({ [polje]: vrijednost }).eq('id', aktivniProjekat.id)
    if (error) alert(`Greška pri čuvanju polja "${polje}": ` + error.message + ' — pokušajte ponovo, izmjena možda nije sačuvana.')
  }

  const obrisiProjekat = async (id) => {
    if (!confirm('Obrisati projekat i sve faze i pozicije?')) return
    try {
      // Eksplicitno brišemo pozicije i faze PRIJE samog projekta — ne oslanjamo se na to da
      // baza ima ON DELETE CASCADE (nismo sigurni da ima), da ne bi ostali "siroti" redovi u
      // bazi koje niko više ne vidi, a koji zauvijek zauzimaju prostor bez ikakve svrhe.
      const { data: fazeZaBrisanje, error: eFaze1 } = await supabase.from('faze').select('id').eq('projekat_id', id)
      if (eFaze1) throw eFaze1
      const fazaIds = (fazeZaBrisanje || []).map(f => f.id)
      if (fazaIds.length > 0) {
        const { error: ePoz } = await supabase.from('pozicije').delete().in('faza_id', fazaIds)
        if (ePoz) throw ePoz
      }
      const { error: eFaze2 } = await supabase.from('faze').delete().eq('projekat_id', id)
      if (eFaze2) throw eFaze2
      const { error: eProj } = await supabase.from('projekti').delete().eq('id', id)
      if (eProj) throw eProj

      setProjekti(prev => prev.filter(p => p.id !== id))
      if (aktivniProjekat?.id === id) { setAktivniProjekat(null); setFaze([]); setPozicije([]) }
    } catch (e) {
      alert('Greška pri brisanju projekta: ' + e.message)
    }
  }

  // ── FAZE ──
  // dodajFazu prima naziv i (opciono) kategoriju. Predefinisana grupa nosi kategoriju (naziv iz
  // REDOSLIJED_KATEGORIJA) — po njoj se zaključava centralni filter i slaže redoslijed. Custom
  // grupa ide bez kategorije (kategorija = null) → vidi cijelu bazu i staje na kraj liste.
  const dodajFazu = async (naziv, kategorija = null) => {
    const nazivTrim = (naziv || '').trim()
    if (!nazivTrim || !aktivniProjekat) return
    // Bez duplikata predefinisanih grupa u istoj struci — ista se može dodati samo jednom
    // (za dvije iste koristi se prilagođena grupa). Custom grupe (bez kategorije) se ne provjeravaju.
    if (kategorija && faze.some(f => f.kategorija === kategorija && (f.struka_kod || 'gradjevinski') === aktivnaStruka)) {
      alert('Grupa „' + nazivTrim + '" je već dodata. Za dvije iste grupe koristite prilagođenu grupu (+ Dodaj).')
      return
    }
    const { data, error } = await supabase.from('faze').insert({
      projekat_id: aktivniProjekat.id, naziv: nazivTrim, redoslijed: faze.length, struka_kod: aktivnaStruka, kategorija: kategorija || null
    }).select().single()
    if (error) { alert('Greška pri dodavanju grupe radova: ' + error.message); return }
    if (data) { setNovaFaza(''); setFaze(prev => sortirajFaze([...prev, data])); setAktivnaFaza(data) }
  }

  const obrisiFeazu = async (id) => {
    if (!confirm('Obrisati grupu radova i sve pozicije?')) return
    try {
      // Eksplicitno brišemo pozicije PRIJE same faze — isti razlog kao kod obrisiProjekat gore.
      const { error: ePoz } = await supabase.from('pozicije').delete().eq('faza_id', id)
      if (ePoz) throw ePoz
      const { error: eFaza } = await supabase.from('faze').delete().eq('id', id)
      if (eFaza) throw eFaza

      setFaze(prev => prev.filter(f => f.id !== id))
      if (aktivnaFaza?.id === id) { setAktivnaFaza(null); setPozicije([]) }
    } catch (e) {
      alert('Greška pri brisanju grupe radova: ' + e.message)
    }
  }

  const preimenujFazu = async (id, noviNaziv) => {
    if (!noviNaziv.trim()) return
    const { error } = await supabase.from('faze').update({ naziv: noviNaziv.trim() }).eq('id', id)
    if (error) { alert('Greška pri preimenovanju grupe radova: ' + error.message); return }
    setFaze(prev => prev.map(f => f.id === id ? { ...f, naziv: noviNaziv.trim() } : f))
    setAktivnaFaza(prev => prev && prev.id === id ? { ...prev, naziv: noviNaziv.trim() } : prev)
  }

  // ── OPŠTI USLOVI GRUPE RADOVA ──
  // Uvodni tekst (tehnički uslovi obračuna, kvaliteta, normativi) koji se prikazuje prije
  // stavki grupe radova i u Excel/PDF exportu. Čuva se u koloni "opsti_uslovi" na tabeli faze.
  //
  // opozivUslova: pamti posljednje OBRISANE (ili zamijenjene) uslove radi mogućnosti vraćanja
  // preko trake "Vrati obrisane uslove". Kao i kod opoziva brisanja pozicije — samo jedan nivo
  // (posljednja radnja), traka nestane nakon nekoliko sekundi ili nakon promjene grupe/projekta.
  const [opozivUslova, setOpozivUslova] = useState(null) // { fazaId, nazivGrupe, stariTekst } | null

  const sacuvajUslove = async (fazaId, tekst, _zaOpoziv = false) => {
    const vrijednost = (tekst || '').trim() || null
    // Zapamti prethodni tekst PRIJE upisa — ako je bio nešto a sad postaje prazno (brisanje) ili
    // se mijenja, nudimo opoziv. Ne nudimo opoziv za sam čin vraćanja (_zaOpoziv).
    const faza = faze.find(f => f.id === fazaId)
    const prethodni = faza?.opsti_uslovi || ''

    const { error } = await supabase.from('faze').update({ opsti_uslovi: vrijednost }).eq('id', fazaId)
    if (error) {
      // Najvjerovatniji uzrok: kolona još ne postoji u bazi (migracija nije pokrenuta).
      // Ne rušimo aplikaciju — javljamo jasno i tiho ostavljamo tekst u lokalnom stanju.
      console.error('Greška pri čuvanju opštih uslova:', error)
      alert('Opšti tehnički uslovi nisu sačuvani. Ako je ovo prvi put — provjerite da je u bazi pokrenuta migracija koja dodaje kolonu "opsti_uslovi" na tabelu faze.')
      return
    }
    setFaze(prev => prev.map(f => f.id === fazaId ? { ...f, opsti_uslovi: vrijednost } : f))
    setAktivnaFaza(prev => prev && prev.id === fazaId ? { ...prev, opsti_uslovi: vrijednost } : prev)

    // Ponudi opoziv samo ako je stvarno nešto izgubljeno (bio tekst, pa obrisan ili zamijenjen)
    // i ako ovo nije samo čin vraćanja. Postojeći → prazno (brisanje) je glavni slučaj, ali
    // pamtimo i zamjenu (postojeći → drugi tekst) da se ne izgubi raniji ručni rad slučajno.
    if (!_zaOpoziv && prethodni.trim() && prethodni.trim() !== vrijednost) {
      setOpozivUslova({ fazaId, nazivGrupe: faza?.naziv || '', stariTekst: prethodni })
    } else if (!_zaOpoziv) {
      setOpozivUslova(null)
    }
  }

  // Vrati posljednje obrisane/zamijenjene opšte tehničke uslove.
  const vratiObrisaneUslove = async () => {
    if (!opozivUslova) return
    await sacuvajUslove(opozivUslova.fazaId, opozivUslova.stariTekst, true)
    setOpozivUslova(null)
    setShowUslovi(true)
    setRevizija(r => r + 1)
  }

  // Vrati predefinisani šablon uslova za kategoriju koja dominira u aktivnoj grupi radova.
  // Kategorija se određuje iz PRVE (glavne) pozicije u grupi — ista logika kao za šifru u
  // exportu. Ako grupa nema stavki ili kategorija nema šablon, vraća null (korisnik piše ručno
  // ili traži AI predlog).
  const sablonZaAktivnuFazu = () => {
    const roditelji = pozicije.filter(p => !p.parent_id)
    const kategorija = roditelji[0]?.kategorija
    if (!kategorija) return null
    return SABLONI_USLOVI[kategorija] || null
  }

  // ── AI PREDLOG OPŠTIH TEHNIČKIH USLOVA ──
  // Klik na "✨ AI predlog uslova" u panelu uslova: otvara AI asistenta (da se vidi tok) i
  // automatski mu prosljeđuje zahtjev da predloži uslove za aktivnu grupu radova. AI vrati
  // tekst u posebnom formatu (---USLOVI---), asistent prikaže pregled i dugme "Primijeni",
  // koje onda pozove primijeniAIUslove niže (ista logika kao procjena cijena / izmjene stavki).
  // Prosljeđuje se preko state-a "zahtjevZaUslove" koji AIAsistent prima kao prop i reaguje na
  // njega jednom (sam ga poništi nakon slanja).
  const [zahtjevZaUslove, setZahtjevZaUslove] = useState(null)

  const zatraziAIUslove = () => {
    if (!aktivnaFaza) return
    const roditelji = pozicije.filter(p => !p.parent_id)
    const kategorija = roditelji[0]?.kategorija || aktivnaFaza.naziv
    // Otvori AI panel da korisnik vidi tok generisanja
    setShowAI(true)
    // Postavi zahtjev — AIAsistent će ga pokupiti i automatski poslati (vidi useEffect u AIAsistent)
    setZahtjevZaUslove({
      fazaId: aktivnaFaza.id,
      kategorija,
      nazivGrupe: aktivnaFaza.naziv,
      imaPostojece: !!(aktivnaFaza.opsti_uslovi && aktivnaFaza.opsti_uslovi.trim()),
      // token da AIAsistent zna da je ovo novi zahtjev (mijenja se svaki put)
      token: Date.now()
    })
  }

  // Poziva AIAsistent kad korisnik klikne "Primijeni" na predložene uslove. Upisuje tekst u
  // polje opštih tehničkih uslova aktivne grupe (zamjenjuje postojeći — potvrda je već data u
  // modalu asistenta). setRevizija forsira remount textarea da prikaže novi tekst i izmjeri visinu.
  const primijeniAIUslove = async (fazaId, tekst) => {
    await sacuvajUslove(fazaId, tekst)
    setShowUslovi(true) // otvori panel da korisnik odmah vidi upisan tekst
    setRevizija(r => r + 1)
  }

  // ── STRUKE (grupisanje faza po disciplini) ──
  const struke = aktivniProjekat?.struke || DEFAULT_STRUKE

  // Zapamti posljednju aktivnu strukу na nivou PROJEKTA (kolona zadnja_struka_kod), da se
  // sljedeći put kad se ovaj projekat otvori vrati tačno na tu strukу, ne uvijek na prvu.
  useEffect(() => {
    if (!aktivniProjekat) return
    if (aktivniProjekat.zadnja_struka_kod === aktivnaStruka) return // već zapamćeno, izbjegni suvišan upis
    supabase.from('projekti').update({ zadnja_struka_kod: aktivnaStruka }).eq('id', aktivniProjekat.id).then(({ error }) => {
      if (error) { console.error('Zadnja aktivna faza (struka) nije zapamćena:', error); return }
      setAktivniProjekat(prev => prev ? { ...prev, zadnja_struka_kod: aktivnaStruka } : prev)
      setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, zadnja_struka_kod: aktivnaStruka } : p))
    })
  }, [aktivnaStruka, aktivniProjekat?.id])

  // Zapamti posljednju aktivnu grupu radova UNUTAR trenutne struke (zadnjaFazaId, upisano u
  // samu struku u JSON polju struke) — svaka struka pamti svoju vlastitu posljednju grupu
  // radova, tako da povratak na npr. Hidrotehničku instalaciju otvara baš onu grupu radova
  // koju je korisnik tamo posljednji put gledao, nezavisno od Građevinsko-zanatskih radova.
  useEffect(() => {
    if (!aktivniProjekat || !aktivnaFaza) return
    const trenutnaStruka = struke.find(s => s.kod === aktivnaStruka)
    if (!trenutnaStruka || trenutnaStruka.zadnjaFazaId === aktivnaFaza.id) return // već zapamćeno
    const nove = struke.map(s => s.kod === aktivnaStruka ? { ...s, zadnjaFazaId: aktivnaFaza.id } : s)
    supabase.from('projekti').update({ struke: nove }).eq('id', aktivniProjekat.id).then(({ error }) => {
      if (error) { console.error('Zadnja grupa radova nije zapamćena:', error); return }
      setAktivniProjekat(prev => prev ? { ...prev, struke: nove } : prev)
      setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, struke: nove } : p))
    })
  }, [aktivnaFaza?.id, aktivnaStruka, aktivniProjekat?.id])

  const azurirajStruke = async (noveStruke) => {
    if (!aktivniProjekat) return
    setAktivniProjekat(prev => ({ ...prev, struke: noveStruke }))
    setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, struke: noveStruke } : p))
    const { error } = await supabase.from('projekti').update({ struke: noveStruke }).eq('id', aktivniProjekat.id)
    if (error) alert('Greška pri čuvanju struka: ' + error.message + ' — izmjena možda nije sačuvana.')
  }

  const preimenujStruku = async (kod, noviNaziv) => {
    if (!noviNaziv.trim()) return
    const nove = struke.map(s => s.kod === kod ? { ...s, naziv: noviNaziv.trim() } : s)
    await azurirajStruke(nove)
  }

  // Uvećanje/umanjenje se podešava PO STRUCI (ne globalno za cijeli projekat), jer različiti
  // izvođači (građevinski, elektro, ViK...) često imaju različitu maržu/popust.
  const postaviUvecanjeStruke = async (kod, pct) => {
    const nove = struke.map(s => s.kod === kod ? { ...s, uvecanjePct: pct } : s)
    await azurirajStruke(nove)
  }

  const postaviUmanjenjeStruke = async (kod, pct) => {
    const nove = struke.map(s => s.kod === kod ? { ...s, umanjenjePct: pct } : s)
    await azurirajStruke(nove)
  }

  const dodajStruku = async (naziv) => {
    if (!naziv.trim()) return
    const kod = `custom-${Date.now()}`
    const nove = [...struke, { kod, naziv: naziv.trim() }]
    await azurirajStruke(nove)
    setAktivnaStruka(kod)
  }

  const obrisiStruku = async (kod) => {
    const fazeUStruci = faze.filter(f => (f.struka_kod || 'gradjevinski') === kod)
    if (fazeUStruci.length > 0) {
      if (!confirm(`Ova faza sadrži ${fazeUStruci.length} grupa radova. Obrisati fazu i sve njene grupe radova i pozicije?`)) return
      for (const f of fazeUStruci) await obrisiFeazu(f.id)
    }
    const nove = struke.filter(s => s.kod !== kod)
    await azurirajStruke(nove)
    if (aktivnaStruka === kod) setAktivnaStruka(nove[0]?.kod || 'gradjevinski')
  }

  // ── POZICIJE ──

  // Sljedeći redoslijed samo za roditelje (bez podstavki)
  const nextRedoslijed = () => {
    const roditelji = pozicije.filter(p => !p.parent_id)
    if (roditelji.length === 0) return 0
    return Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
  }

  const dodajPoziciju = useCallback(async (idx) => {
    const item = baza[idx]
    if (!item) return

    // Ako je "zamjena" aktivna (korisnik je kliknuo 🔁 na nekoj stavci), prepiši TU postojeću
    // stavku umjesto da dodaješ novu — isti ID, isto mjesto u tabeli, ista šifra pozicije.
    if (zamjenaPozicijaId) {
      const cijenaUValuti = valuta === 'EUR' ? item.c : Math.round(konvertujCijenu(item.c, 'EUR', valuta) * 100) / 100
      // Jedinica iz baze je pouzdana (audit jul 2026) — samo je treba normalizovati u kanonski
      // oblik dropdown-a (npr. "Paušalno" -> "pau.", "Kom." -> "kom.") preko fmtJmj.
      await zamijeniPoziciju(zamjenaPozicijaId, { naziv: item.n, jedinica: fmtJmj(item.m), cijena: cijenaUValuti, kategorija: item.k, sifra: item.s || null })
      return
    }

    if (!aktivnaFaza || dodavanjeUTokuRef.current) return
    dodavanjeUTokuRef.current = true
    try {
      const roditelji = pozicije.filter(p => !p.parent_id)
      const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
      // Baza je uvijek u EUR — konvertuj u trenutno izabranu valutu prije upisa
      const cijenaUValuti = valuta === 'EUR' ? item.c : Math.round(konvertujCijenu(item.c, 'EUR', valuta) * 100) / 100
      const { data, error } = await supabase.from('pozicije').insert({
        faza_id: aktivnaFaza.id, naziv: item.n, jedinica: fmtJmj(item.m),
        cijena: cijenaUValuti, kategorija: item.k, redoslijed: red, sifra: item.s || null
      }).select().single()
      if (error) { alert('Greška pri dodavanju stavke: ' + error.message); return }
      if (data) setPozicije(prev => [...prev, data])
    } finally {
      dodavanjeUTokuRef.current = false
    }
  }, [aktivnaFaza, pozicije, valuta, baza, zamjenaPozicijaId])

  const dodajIzMojeBaze = useCallback(async (item) => {
    // Ista logika zamjene kao u dodajPoziciju gore, ali za stavke iz "Moja baza" taba. fmtJmj
    // ovdje je "besplatan" no-op za stavke koje su već u kanonskom obliku, i sigurnosna mreža
    // za starije, ranije sačuvane stavke koje bi mogle imati zastarjeli zapis jedinice.
    // Cijena stavke iz Moje baze čuva se u SVOJOJ valuti (item.v); pri ubacivanju u projekat
    // preračunava se u valutu projekta po tekućem kursu. Starije stavke bez valute = EUR.
    const izVal = item.v || 'EUR'
    const cijenaUProjektu = izVal === valuta ? (item.c || 0) : Math.round(konvertujCijenu(item.c || 0, izVal, valuta) * 100) / 100
    if (zamjenaPozicijaId) {
      await zamijeniPoziciju(zamjenaPozicijaId, { naziv: item.n, jedinica: fmtJmj(item.m), cijena: cijenaUProjektu, kategorija: item.k || 'Moje stavke', sifra: null })
      return
    }

    if (!aktivnaFaza || dodavanjeUTokuRef.current) return
    dodavanjeUTokuRef.current = true
    try {
      const roditelji = pozicije.filter(p => !p.parent_id)
      const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
      const { data, error } = await supabase.from('pozicije').insert({
        faza_id: aktivnaFaza.id, naziv: item.n, jedinica: fmtJmj(item.m),
        cijena: cijenaUProjektu, kategorija: item.k || 'Moje stavke', redoslijed: red
      }).select().single()
      if (error) { alert('Greška pri dodavanju stavke iz moje baze: ' + error.message); return }
      if (data) setPozicije(prev => [...prev, data])
    } finally {
      dodavanjeUTokuRef.current = false
    }
  }, [aktivnaFaza, pozicije, zamjenaPozicijaId, valuta, KURSEVI])

  const dodajVlastitupoziciju = async () => {
    if (!aktivnaFaza || dodavanjeUTokuRef.current) return
    dodavanjeUTokuRef.current = true
    try {
      const roditelji = pozicije.filter(p => !p.parent_id)
      const zadnjaKat = roditelji.length > 0
        ? roditelji[roditelji.length - 1].kategorija
        : 'Ostalo'
      const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
      const { data, error } = await supabase.from('pozicije').insert({
        faza_id: aktivnaFaza.id, naziv: '', jedinica: 'm²',
        cijena: 0, kategorija: zadnjaKat, redoslijed: red
      }).select().single()
      if (error) { alert('Greška pri dodavanju vlastite stavke: ' + error.message); return }
      if (data) setPozicije(prev => [...prev, data])
    } finally {
      dodavanjeUTokuRef.current = false
    }
  }

  // ── DRAG & DROP REDOSLIJED ──
  const dragPoz = React.useRef(null)
  const dragOverPoz = React.useRef(null)
  // Prati da li je korisnik zaista kliknuo na ⠿ ručku prije nego što dozvolimo prevlačenje
  // cijelog reda. Bez ovoga, HTML5 "draggable" na cijelom <tr> hvata SVAKI klik-i-povuci u
  // redu (uključujući prazan prostor pored teksta u ćeliji opisa) kao pokušaj premještanja
  // reda, umjesto da ostavi normalnu selekciju teksta — što kvari očekivano ponašanje selekcije.
  const dragRuckaAktivna = React.useRef(false)

  useEffect(() => {
    const resetujRucku = () => { dragRuckaAktivna.current = false }
    window.addEventListener('mouseup', resetujRucku)
    return () => window.removeEventListener('mouseup', resetujRucku)
  }, [])

  const onDragStart = (e, poz) => {
    // Otkaži prevlačenje ako NIJE pokrenuto sa ⠿ ručke — ostatak reda (uključujući ćeliju
    // opisa i prazan prostor oko teksta) tako ostaje slobodan za običnu selekciju teksta.
    if (!dragRuckaAktivna.current) { e.preventDefault(); return }
    dragPoz.current = poz
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.5'
  }

  const onDragEnd = (e) => {
    dragRuckaAktivna.current = false
    e.currentTarget.style.opacity = '1'
  }

  const onDragOver = (e, poz) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverPoz.current = poz
  }

  const onDrop = async (e, targetPoz) => {
    e.preventDefault()
    if (!dragPoz.current || dragPoz.current.id === targetPoz.id) return
    if (dragPoz.current.parent_id || targetPoz.parent_id) return

    const roditelji = pozicije
      .filter(p => !p.parent_id)
      .sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0))

    const fromIdx = roditelji.findIndex(p => p.id === dragPoz.current.id)
    const toIdx   = roditelji.findIndex(p => p.id === targetPoz.id)
    if (fromIdx === -1 || toIdx === -1) return

    const novi = [...roditelji]
    const [premjesteni] = novi.splice(fromIdx, 1)
    novi.splice(toIdx, 0, premjesteni)

    const updates = novi.map((p, i) => ({ id: p.id, redoslijed: i }))

    setPozicije(prev => prev.map(p => {
      const u = updates.find(u => u.id === p.id)
      return u ? { ...p, redoslijed: u.redoslijed } : p
    }))

    for (const u of updates) {
      const { error } = await supabase.from('pozicije').update({ redoslijed: u.redoslijed }).eq('id', u.id)
      if (error) console.error('Greška pri čuvanju redoslijeda za poziciju', u.id, error)
    }

    dragPoz.current = null
    dragOverPoz.current = null
  }

  const azurirajPoziciju = async (id, polje, vrijednost, _zaOpoziv = false) => {
    const trenutna = pozicije.find(p => p.id === id)
    const staraVrijednost = trenutna ? trenutna[polje] : undefined

    // KLJUČNO: prikaz i undo-stog se ažuriraju ODMAH (optimistički), prije mrežnog poziva ka
    // bazi — ranije se čekalo da se poziv završi prije upisa u undo-stog, pa je "Opozovi" dugme
    // kratko izgledalo neaktivno odmah nakon izmjene (kašnjenje mrežnog round-trip-a).
    setPozicije(prev => prev.map(p => p.id === id ? { ...p, [polje]: vrijednost } : p))
    if (!_zaOpoziv && polje !== 'opis_visina' && trenutna && staraVrijednost !== vrijednost) {
      setIstorijaIzmjena(prev => [...prev.slice(-19), { id, polje, staraVrijednost, novaVrijednost: vrijednost }])
    }

    const { error } = await supabase.from('pozicije').update({ [polje]: vrijednost }).eq('id', id)
    if (error) console.error('Greška pri čuvanju izmjene polja "' + polje + '":', error)
  }

  // Vraća posljednju izmjenu polja (cijena, količina, naziv, šifra, jedinica) na prethodnu
  // vrijednost. Samo jedan korak unazad po klik — može se pozvati više puta uzastopno da se
  // vrati više koraka, sve dok stog nije prazan.
  const opozoviZadnjuIzmjenu = () => {
    setIstorijaIzmjena(prev => {
      if (prev.length === 0) return prev
      const zadnja = prev[prev.length - 1]
      azurirajPoziciju(zadnja.id, zadnja.polje, zadnja.staraVrijednost, true)
      setRevizija(r => r + 1) // forsira polja koja koriste defaultValue da prikažu vraćenu vrijednost
      return prev.slice(0, -1)
    })
  }

  const obrisiPoziciju = async (id) => {
    const poz = pozicije.find(p => p.id === id)
    if (!poz) return
    // Ako se briše roditeljska stavka koja ima podstavke, obriši i njih (baza ne mora imati
    // ON DELETE CASCADE na parent_id) i sačuvaj ih radi mogućnosti opoziva.
    const djecaPoz = pozicije.filter(p => p.parent_id === id)

    try {
      for (const d of djecaPoz) {
        const { error } = await supabase.from('pozicije').delete().eq('id', d.id)
        if (error) throw error
      }
      const { error: eGlavna } = await supabase.from('pozicije').delete().eq('id', id)
      if (eGlavna) throw eGlavna
    } catch (e) {
      // Ne diramo prikaz ako brisanje u bazi nije uspjelo — bez ovoga bi korisnik vidio da je
      // stavka "nestala" iz tabele iako i dalje postoji u bazi (neusklađeno stanje).
      alert('Greška pri brisanju stavke: ' + e.message + ' — stavka NIJE obrisana, pokušajte ponovo.')
      return
    }

    setPozicije(prev => prev.filter(p => p.id !== id && p.parent_id !== id))

    // Prikaži traku "Opozovi brisanje" na par sekundi. Ako je već postojala jedna (od
    // prethodnog brzog brisanja), otkaži njen tajmer da ne ostane da tiho istekne u pozadini
    // dok korisnik gleda traku za NOVO brisanje.
    const timeoutId = setTimeout(() => setOtkazivanjeBrisanja(null), 6000)
    setOtkazivanjeBrisanja(prev => {
      if (prev?.timeoutId) clearTimeout(prev.timeoutId)
      return { poz, djeca: djecaPoz, timeoutId }
    })
  }

  // Pomjeri redoslijed svih postojećih stavki (na istom nivou — iste faze i istog roditelja)
  // koje trenutno zauzimaju ciljano mjesto ili poslije njega, za jedno mjesto unaprijed —
  // "pravi" prostor za umetanje, umjesto da vraćena stavka naivno preuzme broj koji je u
  // međuvremenu (dok je traka za opoziv stajala na ekranu) možda već dodijeljen NEKOJ DRUGOJ
  // stavci. Bez ovoga bi dvije stavke mogle "dijeliti" isti redoslijed broj, što izaziva
  // nepredvidiv poredak nakon opoziva (vraćena stavka upadne na pogrešno mjesto).
  const napraviMjestoZaUmetanje = async (fazaId, parentId, ciljaniRedoslijed) => {
    let upit = supabase.from('pozicije').select('id, redoslijed').eq('faza_id', fazaId)
    upit = parentId ? upit.eq('parent_id', parentId) : upit.is('parent_id', null)
    const { data: postojece, error } = await upit
    if (error) throw error
    const zaPomjeriti = (postojece || []).filter(r => (r.redoslijed ?? 0) >= ciljaniRedoslijed)
    for (const r of zaPomjeriti) {
      const { error: eShift } = await supabase.from('pozicije').update({ redoslijed: (r.redoslijed ?? 0) + 1 }).eq('id', r.id)
      if (eShift) throw eShift
    }
  }

  // Vraća posljednju obrisanu poziciju (i njene podstavke, ako ih je imala) nazad u bazu i
  // prikaz — samo dok traka "Opozovi brisanje" još stoji na ekranu (par sekundi nakon brisanja).
  const opozoviBrisanje = async () => {
    if (!otkazivanjeBrisanja) return
    const { poz, djeca, timeoutId } = otkazivanjeBrisanja
    clearTimeout(timeoutId)
    setOtkazivanjeBrisanja(null)
    try {
      const ciljaniRedoslijed = poz.redoslijed ?? 0
      await napraviMjestoZaUmetanje(poz.faza_id, poz.parent_id || null, ciljaniRedoslijed)

      const { data: novaPoz, error: e1 } = await supabase.from('pozicije').insert({
        faza_id: poz.faza_id, naziv: poz.naziv, jedinica: poz.jedinica, cijena: poz.cijena,
        kolicina: poz.kolicina, kategorija: poz.kategorija, redoslijed: ciljaniRedoslijed,
        sifra: poz.sifra || null, opis_visina: poz.opis_visina || null,
        // KLJUČNO: ako je obrisana stavka bila PODSTAVKA (imala parent_id), moramo vratiti tu
        // istu vezu — bez ovoga bi se vraćala kao nova, samostalna glavna stavka bez roditelja.
        parent_id: poz.parent_id || null
      }).select().single()
      if (e1 || !novaPoz) throw e1 || new Error('Greška pri vraćanju stavke.')

      const novaDjeca = []
      let neuspjelaDjeca = 0
      for (const d of djeca) {
        // Djeca se vraćaju pod NOVIM parent_id (novaPoz.id), koji do ovog trenutka ne postoji
        // ni na jednoj drugoj stavci — nema šanse za sudar redoslijeda, umetanje mjesta nije
        // potrebno, samo se čuva njihov međusobni raniji poredak.
        const { data: novoDijete, error: eDijete } = await supabase.from('pozicije').insert({
          faza_id: d.faza_id, naziv: d.naziv, jedinica: d.jedinica, cijena: d.cijena,
          kolicina: d.kolicina, kategorija: d.kategorija, redoslijed: d.redoslijed,
          sifra: d.sifra || null, opis_visina: d.opis_visina || null, parent_id: novaPoz.id
        }).select().single()
        if (novoDijete) novaDjeca.push(novoDijete)
        else { neuspjelaDjeca++; console.error('Greška pri vraćanju podstavke:', eDijete) }
      }
      if (neuspjelaDjeca > 0) {
        alert(`Glavna stavka je vraćena, ali ${neuspjelaDjeca} od ${djeca.length} podstavki nije uspjelo da se vrati — provjerite ručno.`)
      }

      // Ponovo učitaj kompletnu listu iz baze (umjesto pukog lokalnog dodavanja na kraj niza) —
      // ovo garantuje da se poredak na ekranu tačno poklapa sa stvarnim stanjem u bazi nakon
      // pomjeranja ostalih stavki iznad, umjesto da se oslanjamo na lokalno renderovanje koje bi
      // moglo (kod izjednačenih brojeva redoslijeda) prikazati stavku na neočekivanom mjestu.
      if (aktivnaFaza && aktivnaFaza.id === poz.faza_id) {
        await ucitajPozicije(aktivnaFaza.id)
      }
    } catch (e) {
      alert('Greška pri vraćanju obrisane stavke: ' + e.message)
    }
  }

  const sacuvajUMojuBazu = async (poz) => {
    const { error } = await supabase.from('moja_baza').insert({
      naziv: poz.naziv, jedinica: poz.jedinica, cijena: poz.cijena, kategorija: poz.kategorija
    })
    if (error) { alert('Greška pri čuvanju u moju bazu: ' + error.message); return }
    ucitajMojuBazu()
    alert('Stavka sačuvana u vašu bazu!')
  }

  // ── ZAMJENA POSTOJEĆE STAVKE NOVOM IZ BAZE (U MJESTU) ──
  // Korisnik označi glavnu stavku (🔁), pa klikne rezultat pretrage — umjesto da se doda NOVI
  // red, PREPIŠE SE postojeći: isti ID, isti redoslijed (dakle ista pozicija u tabeli i ista
  // šifra pozicije koju korisnik vidi kao "redni broj"), samo se sadržaj (naziv/jedinica/cijena/
  // kategorija/šifra iz kataloga) mijenja. Količina se namjerno resetuje na 0 — stara količina
  // se odnosila na PRETHODNU stavku i može biti besmislena za novu (npr. druga jedinica mjere).
  // Ako stavka ima podstavke, one se BRIŠU — pripadaju STAROJ stavci (npr. "Prizemlje 20 m²" za
  // sasvim drugu poziciju) i ne bi imale smisla za novu; nova cijena se upisuje direktno na
  // glavnu stavku umjesto da ostane "zbir" nepovezanih starih podstavki.
  const zamijeniPoziciju = async (id, noviPodaci) => {
    try {
      const djecaZaBrisanje = pozicije.filter(p => p.parent_id === id)
      if (djecaZaBrisanje.length > 0) {
        const { error: eDjeca } = await supabase.from('pozicije').delete().eq('parent_id', id)
        if (eDjeca) throw eDjeca
      }
      const { error } = await supabase.from('pozicije').update({
        naziv: noviPodaci.naziv, jedinica: noviPodaci.jedinica, cijena: noviPodaci.cijena,
        kategorija: noviPodaci.kategorija, sifra: noviPodaci.sifra || null, kolicina: 0
      }).eq('id', id)
      if (error) throw error

      setPozicije(prev => prev
        .filter(p => p.parent_id !== id) // ukloni stare podstavke iz prikaza
        .map(p => p.id === id ? {
          ...p, naziv: noviPodaci.naziv, jedinica: noviPodaci.jedinica, cijena: noviPodaci.cijena,
          kategorija: noviPodaci.kategorija, sifra: noviPodaci.sifra || null, kolicina: 0
        } : p))
      setRevizija(r => r + 1) // forsira sva nekontrolisana polja te pozicije (naziv/cijena/šifra/količina/jedinica) da prikažu nove vrijednosti
      setZamjenaPozicijaId(null)
    } catch (e) {
      alert('Greška pri zamjeni stavke: ' + e.message)
    }
  }

  // ── PROMJENA VALUTE — konvertuje sve postojeće cijene u projektu po tekućem kursu ──
  const promijeniValutu = async (novaValuta) => {
    if (novaValuta === valuta) return
    if (!aktivniProjekat) { setValuta(novaValuta); return }

    const potvrda = confirm(
      `Promijeniti valutu sa ${valuta} na ${novaValuta}?\n\n` +
      `Sve postojeće cijene u OVOM projektu (u svim fazama) će se preračunati po kursu ` +
      `1 EUR = ${KURSEVI[novaValuta]} ${novaValuta} (odnosno odgovarajućem odnosu ${valuta}/${novaValuta}).\n\n` +
      `Ovo mijenja stvarne upisane iznose, ne samo oznaku valute.`
    )
    if (!potvrda) return

    setLoading(true)
    try {
      const { data: sveFaze, error: fazeErr } = await supabase.from('faze').select('id').eq('projekat_id', aktivniProjekat.id)
      if (fazeErr) throw fazeErr
      const fazaIds = (sveFaze || []).map(f => f.id)

      if (fazaIds.length > 0) {
        const { data: svePoz, error: pozErr } = await supabase.from('pozicije').select('id, cijena').in('faza_id', fazaIds)
        if (pozErr) throw pozErr

        // Paketno (paralelno) ažuriranje svih stavki odjednom — brže i pouzdanije od jedne-po-jedne
        const rezultati = await Promise.all(
          (svePoz || [])
            .filter(p => p.cijena != null)
            .map(p => {
              const novaCijena = Math.round(konvertujCijenu(p.cijena, valuta, novaValuta) * 100) / 100
              return supabase.from('pozicije').update({ cijena: novaCijena }).eq('id', p.id)
            })
        )
        const neuspjesno = rezultati.filter(r => r.error)
        if (neuspjesno.length > 0) {
          console.error('Neuspjeli update pozicija:', neuspjesno.map(r => r.error))
          throw new Error(`${neuspjesno.length} od ${rezultati.length} stavki nije konvertovano. Valuta NIJE promijenjena — pokušajte ponovo.`)
        }
      }

      // Cijene su uspješno konvertovane u bazi — odmah osvježi prikaz i lokalno stanje,
      // bez obzira na to da li uspije sljedeći (sporedni) korak čuvanja oznake valute.
      // NAPOMENA: setValuta(novaValuta) se poziva ISKLJUČIVO ovdje, u success putanji —
      // ranije je postojao bug gdje se ista linija pozivala i nakon catch bloka, pa bi
      // korisnik vidio alert "valuta NIJE promijenjena" a interfejs bi je ipak promijenio.
      if (aktivnaFaza) await ucitajPozicije(aktivnaFaza.id)
      setRevizija(r => r + 1) // forsira polja cijene da prikažu novu (konvertovanu) vrijednost
      setValuta(novaValuta)

      // Pokušaj trajno zapamtiti izabranu valutu na projektu (za sljedeći put kad se otvori).
      // Ako ovo ne uspije (npr. baza još nema tu kolonu), cijene su svejedno ispravno konvertovane
      // i korisnik to vidi — samo se izbor valute neće zapamtiti nakon osvježavanja stranice.
      const { error: projErr } = await supabase.from('projekti').update({ valuta: novaValuta }).eq('id', aktivniProjekat.id)
      if (projErr) {
        console.error('Valuta konvertovana, ali nije zapamćena na projektu:', projErr)
        alert('Cijene su uspješno konvertovane. Napomena: izbor valute se ovaj put nije trajno zapamtio (tehnički detalj) — javite ovo Claude-u.')
      } else {
        setAktivniProjekat(prev => prev ? { ...prev, valuta: novaValuta } : prev)
      }
    } catch (e) {
      // Valuta OSTAJE nepromijenjena ovdje — nema više setValuta poziva poslije ovog catch bloka.
      alert('Greška pri konverziji cijena — valuta NIJE promijenjena da se izbjegne pogrešno stanje: ' + e.message)
    }
    setLoading(false)
  }

  // Kad AI asistent postavi cijene direktno u određenoj valuti (nije konverzija postojećih,
  // već svježa procjena), treba samo zapamtiti tu valutu na projektu — bez pokretanja
  // konverzije postojećih cijena (one su već ispravno upisane od strane AI-ja).
  const postaviValutuNakonAI = async (novaValuta) => {
    setValuta(novaValuta)
    if (aktivniProjekat) {
      const { error } = await supabase.from('projekti').update({ valuta: novaValuta }).eq('id', aktivniProjekat.id)
      if (!error) setAktivniProjekat(prev => prev ? { ...prev, valuta: novaValuta } : prev)
      else console.error('Valuta nakon AI procjene nije zapamćena na projektu:', error)
    }
  }

  // ── AI PROCJENA CIJENA ──
  const procijeniCijene = async (stavkeNoveCijene) => {
    // stavkeNoveCijene = [{id, cijena}]

    // Odmah ažuriraj lokalni state za trenutni vizuelni feedback
    setPozicije(prev => prev.map(p => {
      const nova = stavkeNoveCijene.find(s => s.id === p.id)
      return nova ? { ...p, cijena: nova.cijena } : p
    }))

    // Snimi u bazu, brojeći eventualne neuspjehe da korisnik ne ostane u uvjerenju da je SVE
    // uspješno primijenjeno ako neki pojedinačni upis padne (mreža, RLS...).
    let neuspjelo = 0
    for (const s of stavkeNoveCijene) {
      const { error } = await supabase.from('pozicije').update({ cijena: s.cijena }).eq('id', s.id)
      if (error) { neuspjelo++; console.error('Greška pri upisu cijene za', s.id, error) }
    }
    if (neuspjelo > 0) alert(`${neuspjelo} od ${stavkeNoveCijene.length} cijena nije uspjelo da se sačuva — provjerite tabelu.`)

    // Ponovo učitaj iz baze radi sigurnosti (potvrda konzistentnosti)
    if (aktivnaFaza) await ucitajPozicije(aktivnaFaza.id)

    // Forsiraj osvježenje prikaza cijena u tabeli
    setRevizija(r => r + 1)
  }

  // ── DOHVAT SVIH POZICIJA CIJELOG PROJEKTA (za AI procjenu cijena cijelog projekta) ──
  // Vraća { faze: [{id, naziv, struka_kod}], pozicijePoFazi: { fazaId: [...pozicije] } }
  // Ovo koristi AIAsistent kad korisnik traži procjenu cijena za CIJELI projekat (sve faze),
  // ne samo trenutno aktivnu grupu radova. Aktivna faza već ima pozicije učitane u "pozicije",
  // ali ostale faze projekta nisu — moraju se dohvatiti iz baze.
  const dohvatiSvePozicijeProjekta = async () => {
    if (!aktivniProjekat || faze.length === 0) return { faze: [], pozicijePoFazi: {} }
    const pozicijePoFazi = {}
    // Paralelni dohvat pozicija za sve faze (brže od redom jednu-po-jednu)
    const rezultati = await Promise.all(
      faze.map(f => supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed'))
    )
    faze.forEach((f, i) => {
      const { data, error } = rezultati[i]
      if (error) { console.error('Greška pri dohvatu pozicija faze', f.naziv, error); pozicijePoFazi[f.id] = []; return }
      pozicijePoFazi[f.id] = data || []
    })
    return {
      faze: faze.map(f => ({ id: f.id, naziv: f.naziv, struka_kod: f.struka_kod || 'gradjevinski' })),
      pozicijePoFazi
    }
  }

  // Upiši procijenjene cijene za pozicije koje mogu biti u BILO KOJOJ fazi projekta (ne samo
  // aktivnoj) — koristi se kod procjene cijelog projekta. Ista logika kao procijeniCijene, ali
  // NE pretpostavlja da su sve pozicije u aktivnoj fazi, pa na kraju osvježava samo aktivnu
  // fazu u prikazu (ostale faze će se ionako ponovo učitati kad korisnik pređe na njih).
  const procijeniCijeneViseFaza = async (stavkeNoveCijene) => {
    // stavkeNoveCijene = [{id, cijena}]
    setPozicije(prev => prev.map(p => {
      const nova = stavkeNoveCijene.find(s => s.id === p.id)
      return nova ? { ...p, cijena: nova.cijena } : p
    }))
    let neuspjelo = 0
    for (const s of stavkeNoveCijene) {
      const { error } = await supabase.from('pozicije').update({ cijena: s.cijena }).eq('id', s.id)
      if (error) { neuspjelo++; console.error('Greška pri upisu cijene za', s.id, error) }
    }
    if (neuspjelo > 0) alert(`${neuspjelo} od ${stavkeNoveCijene.length} cijena nije uspjelo da se sačuva — provjerite tabelu.`)
    if (aktivnaFaza) await ucitajPozicije(aktivnaFaza.id)
    setRevizija(r => r + 1)
  }

  // ── AI PREGLED I POBOLJŠANJE POSTOJEĆIH STAVKI ──
  const primijeniIzmjene = async (stavkeIzmjene) => {
    // stavkeIzmjene = [{id, noviOpis}]

    // Odmah ažuriraj lokalni state za trenutni vizuelni feedback
    setPozicije(prev => prev.map(p => {
      const izm = stavkeIzmjene.find(s => s.id === p.id)
      return izm ? { ...p, naziv: izm.noviOpis } : p
    }))

    // Snimi u bazu — direktno u postojeću ćeliju, ne kao nova stavka
    let neuspjelo = 0
    for (const s of stavkeIzmjene) {
      const { error } = await supabase.from('pozicije').update({ naziv: s.noviOpis }).eq('id', s.id)
      if (error) { neuspjelo++; console.error('Greška pri upisu izmjene za', s.id, error) }
    }
    if (neuspjelo > 0) alert(`${neuspjelo} od ${stavkeIzmjene.length} izmjena nije uspjelo da se sačuva — provjerite tabelu.`)

    // Ponovo učitaj iz baze radi sigurnosti
    if (aktivnaFaza) await ucitajPozicije(aktivnaFaza.id)

    // Forsiraj osvježenje prikaza teksta u tabeli
    setRevizija(r => r + 1)
  }

  // ── KALKULACIJE ──
  const grandTotal = faze.reduce((s, f) => {
    const fazaPoz = f.id === aktivnaFaza?.id ? pozicije : []
    return s + fazaPoz.reduce((ss, p) => ss + calcRow(p, pozicije), 0)
  }, 0)

  const grouped = useMemo(() => {
    const g = {}
    // Samo roditelji sortirani po redoslijedu
    const roditelji = [...pozicije.filter(p => !p.parent_id)]
      .sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0))
    for (const p of roditelji) { const k = p.kategorija || 'Ostalo'; if (!g[k]) g[k] = []; g[k].push(p) }
    return g
  }, [pozicije])

  // Podstavke po parent_id
  const podstavke = useMemo(() => {
    const m = {}
    for (const p of pozicije) {
      if (p.parent_id) {
        if (!m[p.parent_id]) m[p.parent_id] = []
        m[p.parent_id].push(p)
      }
    }
    return m
  }, [pozicije])

  const fazaTotali = useMemo(() => {
    const t = {}
    if (aktivnaFaza) t[aktivnaFaza.id] = pozicije.reduce((s, p) => s + calcRow(p, pozicije), 0)
    return t
  }, [pozicije, aktivnaFaza])


  // ── EXCEL EXPORT ──
  const exportExcel = async (filtrirajStruku = null) => {
    if (!aktivniProjekat || faze.length === 0) { alert('Nema podataka za export.'); return }

    try {
      const svePozicije = {}
      // Paralelno (ne sekvencijalno) učitavanje pozicija za sve faze — brže za projekte sa
      // više grupa radova nego čekanje svake faze jednu po jednu.
      const rezultatiFetch = await Promise.all(
        faze.map(f => supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed'))
      )
      faze.forEach((f, i) => {
        const { data, error } = rezultatiFetch[i]
        if (error) throw error
        svePozicije[f.id] = data || []
      })

      const response = await fetch('/api/excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ projekat: aktivniProjekat, faze, svePozicije, valutaZnak, struke, filtrirajStruku })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({error: 'Server greška'}))
        throw new Error(err.error || 'Greška pri generisanju Excel fajla')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ime = (aktivniProjekat.naziv||'Predmjer').replace(/[^a-zA-Z0-9_À-ɏ]/g,'_')
      a.download = `${ime}_${aktivniProjekat.datum||new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) {
      alert('Greška pri exportu: ' + e.message)
    }
  }

  // ── PDF PRINT ──
  const exportPDF = async (filtrirajStruku = null) => {
    if (!aktivniProjekat || faze.length === 0) { alert('Nema podataka za štampu.'); return }

    const svePozicije = {}
    // Paralelno (ne sekvencijalno) učitavanje pozicija za sve faze — brže za projekte sa više
    // grupa radova nego čekanje svake faze jednu po jednu.
    const rezultatiFetchPdf = await Promise.all(
      faze.map(f => supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed'))
    )
    for (let i = 0; i < faze.length; i++) {
      const { data, error } = rezultatiFetchPdf[i]
      if (error) { alert('Greška pri učitavanju podataka za štampu: ' + error.message); return }
      svePozicije[faze[i].id] = data || []
    }

    const proj = aktivniProjekat
    // Novčani iznosi (2 decimale) — RS/BiH format: tačka za hiljade, zarez za decimale. Isti
    // deterministički pristup kao globalni fmt (ne oslanja se na bs-BA locale koji zna pasti na
    // engleski format u print engine-u).
    const fmtN = n => {
      const num = Number(n) || 0
      const neg = num < 0 ? '-' : ''
      const [cijeli, dec] = Math.abs(num).toFixed(2).split('.')
      return neg + cijeli.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
    }
    // Količine — čuvaju vlastiti broj decimala (npr. 233,123 sa 3 decimale), ali sa RS/BiH
    // separatorima: tačka za hiljade, zarez za decimale. Ne zaokružuje na 2 decimale.
    const fmtKol = n => {
      if (n == null || n === '') return ''
      const [cijeli, dec] = String(n).split('.')
      const ci = (cijeli || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      return dec != null ? ci + ',' + dec : ci
    }
    // Isti obrazac zaštite od HTML specijalnih znakova koji se već koristi za naziv/šifru
    // pozicije, sad primijenjen i na podatke o projektu (naziv, investitor, adresa, datum) —
    // ranije SAMO naziv pozicije je bio zaštićen, ova polja nisu, pa bi npr. "&" ili "<" u
    // nazivu projekta moglo vizuelno polomiti generisani PDF dokument.
    const escHtml = s => (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

    const grupirajPozicije = (poz) => {
      const roditelji = poz.filter(p => !p.parent_id)
      const djecaMap = {}
      for (const p of poz) {
        if (p.parent_id) {
          if (!djecaMap[p.parent_id]) djecaMap[p.parent_id] = []
          djecaMap[p.parent_id].push(p)
        }
      }
      const byK = {}
      for (const p of roditelji) {
        const k = p.kategorija || 'Ostalo'
        if (!byK[k]) byK[k] = []
        byK[k].push({ ...p, djeca: djecaMap[p.id] || [] })
      }
      return byK
    }

    let grandTotal = 0
    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      grandTotal += poz.filter(p => !p.parent_id).reduce((s,p) => s+calcRow(p,poz), 0)
    }
    // Napomena: uvećanje/umanjenje se sada računa PO STRUCI (vidi petlju niže), ne globalno.
    // "ukupno" (finalni zbir za SVEUKUPNO na dnu) se gradi kao zbir već korigovanih iznosa
    // svake pojedinačne struke — postavlja se tek nakon petlje kroz struke.

    let sviFazeSadrzaj = ''
    const strukaSubtotali = [] // { naziv, ukupno } - za rekapitulaciju po struci

    // Grupiši faze po struci (fallback 'gradjevinski' za stare faze bez struke)
    const fazePoStruci = {}
    for (const f of faze) {
      const kod = f.struka_kod || 'gradjevinski'
      if (!fazePoStruci[kod]) fazePoStruci[kod] = []
      fazePoStruci[kod].push(f)
    }

    let brStruke = 0
    for (const s of struke) {
      const fazeUStruci = fazePoStruci[s.kod] || []
      const imaSadrzaja = fazeUStruci.some(f => (svePozicije[f.id]||[]).length > 0)
      if (!imaSadrzaja) continue

      brStruke++
      let strukaUkupno = 0
      const grupaSubtotali = [] // zbirna rekapitulacija grupa radova unutar OVE struke
      const prikaziDetalj = !filtrirajStruku || filtrirajStruku === s.kod

      if (prikaziDetalj) {
        sviFazeSadrzaj += `<div class="struka-blok"><div class="struka-naslov">${toRoman(brStruke)}&nbsp;&nbsp;${s.naziv.toUpperCase()}</div></div>`
      }

      for (const f of fazeUStruci) {
        const poz = svePozicije[f.id] || []
        if (!poz.length) continue
        const byK = grupirajPozicije(poz)

        let rows = ''
        let rb = 1
        for (const [k, stavke] of Object.entries(byK)) {
          rows += `<tr class="kat"><td colspan="7">${k.toUpperCase()}</td></tr>`
          for (const p of stavke) {
            const u = calcRow(p, poz)
            const imadjece = p.djeca.length > 0
            const naziv = (p.naziv||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            const sifra = (p.sifra||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            rows += `<tr>
              <td class="c" style="font-size:11pt;color:#002060;font-weight:600;vertical-align:middle">${rb++}</td>
              <td class="c" style="font-size:8.5pt;color:#8A94A0;vertical-align:middle">${sifra||'—'}</td>
              <td class="opis">${naziv}</td>
              <td class="c" style="vertical-align:bottom">${fmtJmj(p.jedinica)}</td>
              <td class="r" style="vertical-align:bottom">${!imadjece&&(p.cijena||0)>0?fmtN(p.cijena):(imadjece?'<em style="font-size:8pt;color:#888">zbir</em>':'—')}</td>
              <td class="r" style="vertical-align:bottom">${!imadjece&&(p.kolicina||0)>0?fmtKol(p.kolicina):'—'}</td>
              <td class="r bold" style="vertical-align:bottom">${u>0?fmtN(u):'—'}</td>
            </tr>`
            if (imadjece) {
              p.djeca.forEach((d, di) => {
                const du = calcRowSimple(d)
                const dNaziv = (d.naziv||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                rows += `<tr class="pod">
                  <td class="c" style="color:#aaa;font-size:8pt">${rb-1}.${di+1}</td>
                  <td></td>
                  <td class="pod-opis">${dNaziv}</td>
                  <td class="c" style="font-size:8.5pt">${fmtJmj(d.jedinica)}</td>
                  <td class="r" style="font-size:8.5pt">${(d.cijena||0)>0?fmtN(d.cijena):'—'}</td>
                  <td class="r" style="font-size:8.5pt">${(d.kolicina||0)>0?fmtKol(d.kolicina):'—'}</td>
                  <td class="r" style="color:#4A637C;font-weight:600;font-size:8.5pt">${du>0?fmtN(du):'—'}</td>
                </tr>`
              })
              const ukKol = p.djeca.reduce((s,d) => s+(parseFloat(d.kolicina)||0), 0)
              rows += `<tr class="pod-sum">
                <td></td>
                <td></td>
                <td colspan="4" style="font-style:italic;font-size:8pt;color:#666">Ukupno: ${fmtKol(ukKol.toFixed(2))} ${fmtJmj(p.jedinica)}</td>
                <td class="r" style="font-weight:bold;color:#1B2F43;font-size:9pt">${fmtN(u)}</td>
              </tr>`
            }
          }
        }
        const ft = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
        strukaUkupno += ft
        grupaSubtotali.push({ naziv: f.naziv, ukupno: ft })
        rows += `<tr class="total"><td colspan="6" style="text-align:right">UKUPNO GRUPA (${valutaZnak}):</td><td class="r bold">${fmtN(ft)}</td></tr>`

        if (prikaziDetalj) {
          // Šifra se uzima iz stvarne kategorije PRVE (glavne) pozicije u grupi radova, ne iz
          // naziva same grupe (koji korisnik slobodno piše i može se razlikovati od zvaničnog
          // naziva kategorije, npr. "Betonski radovi" umjesto "Betonski i AB radovi").
          const prvaKategorija = poz.find(p => !p.parent_id)?.kategorija
          const sifFaze = SIFRA_KATEGORIJE_MAP.get((prvaKategorija||'').trim())
          const naslovFaze = escHtml(sifFaze ? `${sifFaze}. ${f.naziv.toUpperCase()}` : f.naziv.toUpperCase())
          sviFazeSadrzaj += `
            <div class="faza-header"><h2>${naslovFaze}</h2></div>
            ${f.opsti_uslovi ? `<div class="opsti-uslovi">${escHtml(f.opsti_uslovi).replace(/\n/g, '<br>')}</div>` : ''}
            <table>
              <thead><tr>
                <th class="c" style="width:28px">R.br.</th>
                <th class="c" style="width:56px">Šifra</th>
                <th>Opis pozicije</th>
                <th class="c" style="width:34px">J.mj.</th>
                <th class="r" style="width:78px">Jed. cijena (${valutaZnak})</th>
                <th class="r" style="width:62px">Količina</th>
                <th class="r" style="width:95px">Ukupno (${valutaZnak})</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <div style="margin-bottom:16px"></div>`
        }
      }

      if (prikaziDetalj) {
        // Zbirna rekapitulacija grupa radova unutar ove struke (samo ako ih ima više od jedne)
        if (grupaSubtotali.length > 1) {
          const grupaRekapRows = grupaSubtotali.map(g =>
            `<tr><td>${g.naziv}</td><td class="r">${fmtN(g.ukupno)} ${valutaZnak}</td></tr>`
          ).join('')
          sviFazeSadrzaj += `
            <div class="faza-header"><h2>ZBIRNA REKAPITULACIJA — ${s.naziv.toUpperCase()}</h2></div>
            <table><tbody>${grupaRekapRows}</tbody></table>
            <div style="margin-bottom:16px"></div>`
        }
        sviFazeSadrzaj += `<div class="struka-total">UKUPNO ${toRoman(brStruke)} — ${s.naziv.toUpperCase()}: <span>${fmtN(strukaUkupno)} ${valutaZnak}</span></div>`

        // ── Uvećanje/umanjenje se podešava PO STRUCI (svaki izvođač može imati drugačiju
        // maržu/popust), ne globalno za cijeli projekat. ──
        const strukaUvecPct = s.uvecanjePct || 0
        const strukaUmanPct = s.umanjenjePct || 0
        const strukaUvec = strukaUkupno * strukaUvecPct / 100
        const strukaUman = strukaUkupno * strukaUmanPct / 100
        const strukaSveukupno = strukaUkupno + strukaUvec - strukaUman
        if (strukaUvecPct > 0 || strukaUmanPct > 0) {
          sviFazeSadrzaj += `<table class="struka-korekcija"><tbody>`
          if (strukaUvec > 0) {
            sviFazeSadrzaj += `<tr><td style="color:#1B2F43">+ Uvećanje (${strukaUvecPct}%)</td><td class="r" style="color:#1B2F43">+${fmtN(strukaUvec)} ${valutaZnak}</td></tr>`
          }
          if (strukaUman > 0) {
            sviFazeSadrzaj += `<tr><td style="color:#C0392B">− Umanjenje (${strukaUmanPct}%)</td><td class="r" style="color:#C0392B">−${fmtN(strukaUman)} ${valutaZnak}</td></tr>`
          }
          sviFazeSadrzaj += `<tr class="total"><td><strong>SVEUKUPNO ${toRoman(brStruke)}</strong></td><td class="r bold">${fmtN(strukaSveukupno)} ${valutaZnak}</td></tr>`
          sviFazeSadrzaj += `</tbody></table>`
        }

        // Globalna rekapitulacija zbraja VEĆ KORIGOVANE iznose po struci (ne primjenjuje
        // dodatnu korekciju na nivou cijelog projekta — svaka struka je već obračunata).
        strukaSubtotali.push({ naziv: s.naziv, ukupno: strukaSveukupno, rimski: toRoman(brStruke) })
      } else {
        // Struka nije detaljno prikazana (filtriran export samo za jednu drugu struku) —
        // i dalje treba njena korigovana vrijednost radi tačnosti eventualne agregacije.
        const strukaUvecPct = s.uvecanjePct || 0
        const strukaUmanPct = s.umanjenjePct || 0
        const strukaSveukupno = strukaUkupno + strukaUkupno*strukaUvecPct/100 - strukaUkupno*strukaUmanPct/100
        strukaSubtotali.push({ naziv: s.naziv, ukupno: strukaSveukupno, rimski: toRoman(brStruke) })
      }
    }

    const rekapRows = strukaSubtotali.map(s => {
      return `<tr><td>${s.rimski}&nbsp;&nbsp;${s.naziv}</td><td class="r">${fmtN(s.ukupno)} ${valutaZnak}</td></tr>`
    }).join('')

    // Finalna rekapitulacija SVIH faza projekta se prikazuje samo za kompletan export
    // ili kad se izvozi Građevinsko-zanatski (glavni/koordinacioni dokument projekta).
    // Ostale pojedinačne faze (ViK, Elektro, Mašinske, Vanjsko) su samostalni dokumenti
    // za tog izvođača i ne treba da otkrivaju cijene drugih struka.
    // Sveukupno projekta je prost zbir već korigovanih iznosa po struci — svaka struka
    // je obračunata sa svojim vlastitim uvećanjem/umanjenjem, pa se ovdje ništa dodatno
    // ne primjenjuje (izbjegava dvostruko računanje korekcije).
    const ukupno = strukaSubtotali.reduce((s, x) => s + x.ukupno, 0)
    const imaBiloKakvuKorekciju = struke.some(s => (s.uvecanjePct||0) > 0 || (s.umanjenjePct||0) > 0)

    const prikaziGlobalnuRekapitulaciju = !filtrirajStruku || filtrirajStruku === 'gradjevinski'
    const globalnaRekapitulacijaHtml = prikaziGlobalnuRekapitulaciju ? `
<div class="page-break"></div>
<h2 style="color:#1B2F43;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1B2F43">REKAPITULACIJA</h2>
<table style="width:400px">
  <thead><tr><th>Faza</th><th class="r">Ukupno (${valutaZnak})</th></tr></thead>
  <tbody>
    ${rekapRows}
    ${imaBiloKakvuKorekciju ? `<tr><td colspan="2" style="font-size:8pt;color:#888;font-style:italic;padding-top:2px">* iznosi po fazi već uključuju eventualno uvećanje/umanjenje te faze</td></tr>` : ''}
    <tr class="total"><td><strong>SVEUKUPNO</strong></td><td class="r bold" style="font-size:12pt">${fmtN(ukupno)} ${valutaZnak}</td></tr>
  </tbody>
</table>` : ''

    const html = `<!DOCTYPE html><html lang="bs">
<head><meta charset="UTF-8"><title>Predmjer — ${escHtml(proj.naziv)}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
  body { font-family:Arial,sans-serif; font-size:10pt; color:#111; }
  .header { margin-bottom:16px; border-bottom:2px solid #1B2F43; padding-bottom:10px; }
  .header h1 { font-size:15pt; color:#1B2F43; margin-bottom:6px; }
  .header h1 { font-size:15pt; color:#1B2F43; margin-bottom:6px; background:#B9CDE5 !important; padding:8px 10px; text-align:center; border-radius:2px; }
  .info { display:grid; grid-template-columns:1fr 1fr; gap:3px 20px; font-size:9pt; margin-top:8px; }
  .info span { color:#555; }
  .struka-blok { page-break-after:avoid; }
  .struka-naslov { background:#1B2F43 !important; color:#fff !important; font-size:13pt; font-weight:700; padding:9px 12px; margin:18px 0 10px; letter-spacing:.03em; }
  .struka-blok:first-child .struka-naslov { margin-top:4px; }
  .struka-total { background:#E8ECF0 !important; color:#1B2F43 !important; font-size:11pt; font-weight:700; padding:8px 12px; margin:6px 0 10px; border-top:2px solid #1B2F43; border-bottom:2px solid #1B2F43; display:flex; justify-content:space-between; }
  .struka-korekcija { margin:0 0 22px; }
  .struka-korekcija td { font-size:9.5pt; padding:4px 12px; border-bottom:none; }
  .faza-header h2 { font-size:14pt; color:#1B2F43; margin:14px 0 5px; padding:6px 10px; border-bottom:1px solid #4A637C; background:#B9CDE5 !important; border-radius:2px; }
  .opsti-uslovi { font-size:8.5pt; color:#333; line-height:1.5; margin:0 0 10px; padding:8px 12px; background:#F7F8FA !important; text-align:justify; }
  table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  th { background:#1B2F43 !important; color:#fff !important; padding:5px 6px; text-align:left; font-size:8pt; text-transform:uppercase; }
  th.r { text-align:right; } th.c { text-align:center; }
  td { padding:4px 6px; border-bottom:1px solid #E5E5E0; vertical-align:top; font-size:9.5pt; }
  tr:nth-child(even) td { background:#F9F9F7 !important; }
  .kat td { background:#EEF0F3 !important; font-weight:700; font-size:8.5pt; color:#1B2F43 !important; text-transform:uppercase; }
  .pod td { background:#FAFAF8 !important; border-bottom:none; }
  .pod-opis { padding-left:16px; font-size:9pt; color:#444; }
  .pod-sum td { background:#F5F6F8 !important; border-top:1px solid #D8D5CC; border-bottom:1px solid #D8D5CC; }
  .total td { background:#EEF0F3 !important; font-weight:700; border-top:2px solid #1B2F43; }
  .c { text-align:center; } .r { text-align:right; }
  td.c, td.r { white-space:nowrap; }
  .opis { line-height:1.4; } .bold { font-weight:700; }
  .page-break { page-break-before:always; margin-top:16px; }
  @page {
    margin: 14mm 12mm 18mm 20mm;
    @bottom-right {
      content: "Strana " counter(page) " od " counter(pages);
      font-size: 8pt;
      color: #666666;
      font-family: Arial, sans-serif;
    }
    @bottom-left {
      content: "${(firma?.naziv || 'Predmjer i Predračun').replace(/"/g, '\\"')}";
      font-size: 8pt;
      color: #1B2F43;
      font-family: Arial, sans-serif;
    }
  }
  @media print {
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    th { background:#1B2F43 !important; color:#fff !important; }
    .kat td { background:#EEF0F3 !important; }
    .total td { background:#EEF0F3 !important; }
    .pod-sum td { background:#F5F6F8 !important; }
    .struka-naslov { background:#1B2F43 !important; color:#fff !important; }
    .struka-total { background:#E8ECF0 !important; color:#1B2F43 !important; }
    .header h1 { background:#B9CDE5 !important; }
    .faza-header h2 { background:#B9CDE5 !important; }
  }
</style></head>
<body>
<div class="header">
  ${firma?.logo ? `<div style="text-align:left;margin-bottom:6px;"><img src="${firma.logo}" style="height:52px;max-width:150px;object-fit:contain;" /></div>` : ''}
  <h1 style="text-align:center;">PREDMJER I PREDRAČUN</h1>
  ${filtrirajStruku ? `<div style="text-align:center;font-size:10pt;color:#4A637C;margin-top:-4px;margin-bottom:6px;">— ${escHtml(struke.find(s=>s.kod===filtrirajStruku)?.naziv || '')} —</div>` : ''}
  <div class="info">
    <div><span>Projekat: </span><strong>${escHtml(proj.naziv)||'—'}</strong></div>
    <div style="text-align:right;"><span>Investitor: </span><strong>${escHtml(proj.klijent)||'—'}</strong></div>
    <div><span>Datum: </span>${escHtml(proj.datum)||'—'}</div>
    <div style="text-align:right;"><span>Lokacija: </span>${escHtml(proj.adresa)||'—'}</div>
  </div>
</div>
${sviFazeSadrzaj}
${globalnaRekapitulacijaHtml}
</body></html>`

    // Otvori print prozor
    const printWin = window.open('', '_blank', 'width=1000,height=750,scrollbars=yes')
    if (!printWin) {
      alert('Molimo dozvolite popup prozore za ovaj sajt da bi štampa radila.')
      return
    }
    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()
    // Čekaj da se učita pa štampaj
    printWin.addEventListener('load', () => {
      setTimeout(() => printWin.print(), 300)
    })
    // Fallback ako load event ne okine
    setTimeout(() => {
      try { printWin.print() } catch(e) {}
    }, 1200)
  }


  // ── AI ASISTENT - dodaj stavku ──
  const dodajStavkuIzAI = async (stavka) => {
    if (!aktivnaFaza) return

    // Uzmi kategoriju zadnje stavke u aktivnoj fazi (ne AI-jevu izmišljenu)
    const roditelji = pozicije.filter(p => !p.parent_id)
    const aktivnaKategorija = roditelji.length > 0
      ? roditelji[roditelji.length - 1].kategorija
      : 'Ostalo'

    // Ukloni ** Markdown bold iz naziva
    const cleanNaziv = (stavka.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '').trim()

    // AI ponekad pogriješi JMJ polje u odnosu na ono što opis stvarno kaže (rjeđe nego kod
    // ručnog unosa, ali se dešava) — prepoznajJedinicu iz opisa ima prednost ako je pouzdana,
    // inače se koristi ono što je AI eksplicitno naveo (normalizovano preko fmtJmj).
    const jedinicaZaUpis = prepoznajJedinicu(cleanNaziv) || fmtJmj(stavka.jedinica || 'm²')

    const rod = pozicije.filter(p => !p.parent_id)
    const red = rod.length === 0 ? 0 : Math.max(...rod.map(p => p.redoslijed ?? 0)) + 1

    const { data, error } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id,
      naziv: cleanNaziv,
      jedinica: jedinicaZaUpis,
      cijena: parseFloat(stavka.cijena) || 0,
      kategorija: aktivnaKategorija,
      redoslijed: red
    }).select().single()
    if (error) { alert('Greška pri dodavanju stavke iz AI asistenta: ' + error.message); return }
    if (data) setPozicije(prev => [...prev, data])
  }


  // ── KLONIRANJE PROJEKTA ──
  const klonirajProjekat = async () => {
    if (!aktivniProjekat) return
    if (!confirm(`Klonirati projekat "${aktivniProjekat.naziv}"? Bit će kreiran novi projekat sa svim fazama i pozicijama.`)) return
    
    setKloniranjeLoading(true)
    let neuspjelihStavki = 0
    try {
      // Kreiraj novi projekat
      const { data: noviProj, error: eProj } = await supabase.from('projekti').insert({
        naziv: aktivniProjekat.naziv + ' — KOPIJA',
        klijent: aktivniProjekat.klijent,
        adresa: aktivniProjekat.adresa,
        datum: aktivniProjekat.datum,
        uvecanje_pct: aktivniProjekat.uvecanje_pct,
        umanjenje_pct: aktivniProjekat.umanjenje_pct,
        valuta: aktivniProjekat.valuta || 'EUR',
        // KLJUČNO: kopirati stvarne strukе originalnog projekta (nazivi, eventualno
        // preimenovani/obrisani/custom dodati, uvecanjePct/umanjenjePct po struci).
        // Bez ovoga bi klon tiho pao na generički DEFAULT_STRUKE i izgubio sve te izmjene,
        // a auto-selekcija prve grupe radova bi tražila strukе po pogrešnim kodovima.
        struke: aktivniProjekat.struke || DEFAULT_STRUKE
      }).select().single()

      if (eProj || !noviProj) throw eProj || new Error('Greška pri kreiranju projekta')

      // Ucitaj sve faze originalnog projekta
      const { data: originalFaze, error: eFaze } = await supabase.from('faze').select('*').eq('projekat_id', aktivniProjekat.id).order('redoslijed')
      if (eFaze) throw eFaze

      // Za svaku fazu kreiraj kopiju
      for (const f of (originalFaze || [])) {
        const { data: novaFaza, error: eNovaFaza } = await supabase.from('faze').insert({
          projekat_id: noviProj.id,
          naziv: f.naziv,
          redoslijed: f.redoslijed,
          struka_kod: f.struka_kod,
          // KLJUČNO: kloniraj i opšte tehničke uslove grupe radova — bez ovoga bi klon izgubio
          // sav uneseni tekst uslova (šablon, AI predlog ili ručni unos) za svaku grupu radova.
          opsti_uslovi: f.opsti_uslovi || null,
          // Prenesi i vezu na kategoriju šifarnika (predefinisana grupa) — da klon zadrži
          // zaključavanje filtera i redoslijed po numeraciji. Custom grupe imaju null.
          kategorija: f.kategorija || null
        }).select().single()

        if (eNovaFaza || !novaFaza) { console.error('Greška pri kloniranju faze', f.naziv, eNovaFaza); continue }

        // Ucitaj pozicije ove faze i kopiraj ih sa parent_id vezama
        const { data: originalPoz, error: ePoz } = await supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed')
        if (ePoz) { console.error('Greška pri učitavanju pozicija za kloniranje, faza', f.naziv, ePoz); continue }
        
        if (originalPoz && originalPoz.length > 0) {
          // Prvo ubaci roditelje (bez parent_id)
          const roditelji = originalPoz.filter(p => !p.parent_id)
          const idMapa = {} // stari_id -> novi_id

          for (const p of roditelji) {
            const { data: novaPoz, error: eNovaPoz } = await supabase.from('pozicije').insert({
              faza_id: novaFaza.id,
              naziv: p.naziv,
              jedinica: p.jedinica,
              cijena: p.cijena,
              kolicina: p.kolicina,
              kategorija: p.kategorija,
              redoslijed: p.redoslijed,
              sifra: p.sifra || null,
              opis_visina: p.opis_visina || null,
              parent_id: null
            }).select().single()
            if (novaPoz) idMapa[p.id] = novaPoz.id
            else { neuspjelihStavki++; console.error('Greška pri kloniranju stavke:', eNovaPoz) }
          }

          // Zatim ubaci podstavke sa mapiranim parent_id
          const djeca = originalPoz.filter(p => p.parent_id)
          for (const d of djeca) {
            const noviParentId = idMapa[d.parent_id]
            if (!noviParentId) continue
            const { error: eDijete } = await supabase.from('pozicije').insert({
              faza_id: novaFaza.id,
              naziv: d.naziv,
              jedinica: d.jedinica,
              cijena: d.cijena,
              kolicina: d.kolicina,
              kategorija: d.kategorija,
              redoslijed: d.redoslijed,
              sifra: d.sifra || null,
              opis_visina: d.opis_visina || null,
              parent_id: noviParentId
            })
            if (eDijete) { neuspjelihStavki++; console.error('Greška pri kloniranju podstavke:', eDijete) }
          }
        }
      }

      // Ucitaj projekte i odaberi novi
      await ucitajProjekte()
      setAktivniProjekat(noviProj)
      // Napomena: postavljanje aktivniProjekat gore automatski pokreće useEffect na
      // aktivniProjekat?.id, koji učitava faze i bira prvu grupu radova nove (klonirane)
      // strukе — ista logika kao pri običnom ulasku u aplikaciju, bez potrebe za duplim kodom.
      if (neuspjelihStavki > 0) {
        alert(`Projekat je kloniran, ali ${neuspjelihStavki} stavki nije uspjelo da se kopira — provjerite klon i po potrebi ih ručno dodajte.`)
      }
    } catch(e) {
      alert('Greška pri kloniranju: ' + e.message)
    }
    setKloniranjeLoading(false)
  }

  // ── IZVOZ PROJEKTA U FAJL (za dijeljenje sa kolegom na drugom nalogu) ──
  // Fajl je samostalan (self-contained) — koristi lokalne, redni brojeve unutar samog fajla
  // za veze roditelj/podstavka (_lokalniId/_roditeljLokalniId), NE stvarne ID-jeve iz baze,
  // kako fajl ne bi zavisio od/otkrivao interne DB identifikatore.
  const exportProjekat = async () => {
    if (!aktivniProjekat) { alert('Odaberite projekat za izvoz.'); return }
    try {
      const svePozicije = {}
      // Paralelno (ne sekvencijalno) učitavanje pozicija za sve faze — brže za projekte sa
      // više grupa radova nego čekanje svake faze jednu po jednu.
      const rezultatiFetch = await Promise.all(
        faze.map(f => supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed'))
      )
      faze.forEach((f, i) => {
        const { data, error } = rezultatiFetch[i]
        if (error) throw error
        svePozicije[f.id] = data || []
      })

      const izvozFaze = faze.map(f => {
        const poz = svePozicije[f.id] || []
        const lokalnaMapa = new Map(poz.map((p, i) => [p.id, i]))
        const izvozStavke = poz.map(p => ({
          _lokalniId: lokalnaMapa.get(p.id),
          _roditeljLokalniId: p.parent_id != null ? (lokalnaMapa.get(p.parent_id) ?? null) : null,
          naziv: p.naziv, jedinica: p.jedinica, cijena: p.cijena, kolicina: p.kolicina,
          kategorija: p.kategorija, redoslijed: p.redoslijed, sifra: p.sifra || null,
          opis_visina: p.opis_visina || null
        }))
        return { naziv: f.naziv, redoslijed: f.redoslijed, struka_kod: f.struka_kod || 'gradjevinski', kategorija: f.kategorija || null, opsti_uslovi: f.opsti_uslovi || null, pozicije: izvozStavke }
      })

      const izvoz = {
        tip: 'predmjer-projekat', verzija: 1, izvezeno_at: new Date().toISOString(),
        projekat: {
          naziv: aktivniProjekat.naziv, klijent: aktivniProjekat.klijent || null,
          adresa: aktivniProjekat.adresa || null, datum: aktivniProjekat.datum || null,
          valuta: aktivniProjekat.valuta || 'EUR', struke: aktivniProjekat.struke || DEFAULT_STRUKE
        },
        faze: izvozFaze
      }

      const blob = new Blob([JSON.stringify(izvoz, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Samo znakovi koji su STVARNO nedozvoljeni u imenu fajla se uklanjaju — razmaci, crtice,
      // zagrade i slova č/ć/š/ž/đ ostaju netaknuti. Ovo je namjerno: ime fajla se sad koristi kao
      // izvor naziva projekta pri UVOZU (vidi ucitajProjekatIzFajla), pa treba da ostane čitljivo
      // i tačno onakvo kakav je bio naziv projekta, ako korisnik fajl ne preimenuje ručno.
      const ime = (aktivniProjekat.naziv || 'Predmjer').replace(/[\\/:*?"<>|]/g, '_').trim()
      a.download = `${ime}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Greška pri izvozu projekta: ' + e.message)
    }
  }

  // ── UVOZ PROJEKTA IZ FAJLA ──
  // KLJUČNO: uvoz UVIJEK kreira potpuno nov projekat — nikad ne dira, ne prepisuje i ne spaja
  // sa postojećim projektima na nalogu. Ovo je namjerno, iz sigurnosnih/UX razloga: uvoz ne
  // smije imati mogućnost da "pogodi" i prepiše nešto što korisnik već ima.
  const ucitajProjekatIzFajla = async (file) => {
    setUvozLoading(true)
    let neuspjelihStavki = 0
    try {
      const tekst = await file.text()
      let podaci
      try { podaci = JSON.parse(tekst) }
      catch (e) { throw new Error('Fajl nije ispravan JSON — provjerite da li je to zaista izvezeni predmjer.') }

      if (podaci?.tip !== 'predmjer-projekat' || !podaci.projekat || !Array.isArray(podaci.faze)) {
        throw new Error('Ovaj fajl ne izgleda kao izvezeni predmjer iz ove aplikacije.')
      }

      const p = podaci.projekat
      // KLJUČNO: naziv se uzima iz IMENA FAJLA (ne iz podataka upisanih unutar njega u trenutku
      // izvoza) — ako korisnik preimenuje .json fajl prije uvoza (npr. da pošalje kolegi pod
      // drugim imenom), uvezeni projekat treba da se pojavi pod TIM novim imenom, ne pod starim.
      // Ako iz nekog razloga ime fajla ispadne prazno, koristimo naziv iz sadržaja kao rezervu.
      const nazivIzFajla = (file.name || '').replace(/\.json$/i, '').trim()
      const finalniNaziv = (nazivIzFajla || p.naziv || 'Predmjer') + ' — UVEZENO'
      const { data: noviProj, error: eProj } = await supabase.from('projekti').insert({
        naziv: finalniNaziv,
        klijent: p.klijent || null,
        adresa: p.adresa || null,
        datum: p.datum || null,
        valuta: p.valuta || 'EUR',
        struke: p.struke || DEFAULT_STRUKE
      }).select().single()
      if (eProj || !noviProj) throw eProj || new Error('Greška pri kreiranju projekta.')

      for (const f of podaci.faze) {
        const { data: novaFaza, error: eFaza } = await supabase.from('faze').insert({
          projekat_id: noviProj.id, naziv: f.naziv || 'Grupa radova',
          redoslijed: f.redoslijed ?? 0, struka_kod: f.struka_kod || 'gradjevinski',
          // Uvezi i opšte tehničke uslove ako ih fajl sadrži (izvezeni novijom verzijom aplikacije).
          // Stariji fajlovi ih nemaju — tada ostaje null, što je ispravno.
          opsti_uslovi: f.opsti_uslovi || null,
          kategorija: f.kategorija || null
        }).select().single()
        if (eFaza || !novaFaza) { console.error('Greška pri uvozu grupe radova', f.naziv, eFaza); continue }

        const stavke = Array.isArray(f.pozicije) ? f.pozicije : []
        const idMapa = new Map() // _lokalniId iz fajla -> stvarni novi DB id

        // Prvo roditelji (bez _roditeljLokalniId), da postoji mapa prije umetanja podstavki
        const roditelji = stavke.filter(s => s._roditeljLokalniId == null)
        for (const s of roditelji) {
          const { data: novaPoz, error: eNovaPoz } = await supabase.from('pozicije').insert({
            faza_id: novaFaza.id, naziv: s.naziv || '', jedinica: s.jedinica || 'm²',
            cijena: s.cijena || 0, kolicina: s.kolicina || 0, kategorija: s.kategorija || 'Ostalo',
            redoslijed: s.redoslijed ?? 0, sifra: s.sifra || null, opis_visina: s.opis_visina || null,
            parent_id: null
          }).select().single()
          if (novaPoz) idMapa.set(s._lokalniId, novaPoz.id)
          else { neuspjelihStavki++; console.error('Greška pri uvozu stavke:', eNovaPoz) }
        }

        // Zatim podstavke, mapirane na novokreirane parent ID-jeve
        const djeca = stavke.filter(s => s._roditeljLokalniId != null)
        for (const s of djeca) {
          const noviParentId = idMapa.get(s._roditeljLokalniId)
          if (!noviParentId) continue
          const { error: eDijete } = await supabase.from('pozicije').insert({
            faza_id: novaFaza.id, naziv: s.naziv || '', jedinica: s.jedinica || 'm²',
            cijena: s.cijena || 0, kolicina: s.kolicina || 0, kategorija: s.kategorija || 'Ostalo',
            redoslijed: s.redoslijed ?? 0, sifra: s.sifra || null, opis_visina: s.opis_visina || null,
            parent_id: noviParentId
          })
          if (eDijete) { neuspjelihStavki++; console.error('Greška pri uvozu podstavke:', eDijete) }
        }
      }

      await ucitajProjekte()
      setAktivniProjekat(noviProj)
      if (neuspjelihStavki > 0) {
        alert(`Projekat je uvezen, ali ${neuspjelihStavki} stavki nije uspjelo da se prenese — provjerite uvezeni projekat.`)
      }
    } catch (e) {
      alert('Greška pri uvozu projekta: ' + e.message)
    }
    setUvozLoading(false)
  }

  const odjava = () => supabase.auth.signOut()

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#C7C7C4' }}>
      <div style={{ fontSize: 14, color: '#888' }}>Učitavanje...</div>
    </div>
  )

  if (!session) return <Auth />

  const B = (bg, color = '#fff', border = 'none') => ({
    padding: '6px 12px', borderRadius: 6, border, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', background: bg, color, whiteSpace: 'nowrap'
  })

  const aktivnaFazaStruka = aktivnaFaza ? struke.find(s => (aktivnaFaza.struka_kod || 'gradjevinski') === s.kod) : null
  const aktivnaFazaUvecanjePct = aktivnaFazaStruka?.uvecanjePct || 0
  const aktivnaFazaUmanjenjePct = aktivnaFazaStruka?.umanjenjePct || 0
  const fazaVlastitiZbir = aktivnaFaza ? (fazaTotali[aktivnaFaza.id] || 0) : 0
  const uvecanje = fazaVlastitiZbir * aktivnaFazaUvecanjePct / 100
  const umanjenje = fazaVlastitiZbir * aktivnaFazaUmanjenjePct / 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: 13, background: '#C7C7C4', color: '#1A1A18' }}>
      <style>{`
        ::-webkit-scrollbar { width: 12px; height: 12px; }
        ::-webkit-scrollbar-track { background: #C7C7C4; }
        ::-webkit-scrollbar-thumb { background: #F2F2F0; border-radius: 8px; border: 2px solid #C7C7C4; }
        ::-webkit-scrollbar-thumb:hover { background: #FFFFFF; }
        .drag-rucka, .red-akcije { opacity: 0; transition: opacity .12s ease; }
        tr:hover .drag-rucka, tr:hover .red-akcije { opacity: 1; }
        .sifra-input::placeholder { color: #C9CDD2; font-weight: 400; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: '#1B2F43', color: '#fff', padding: '0 18px', height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>📐 Predmjer / Troškovnik</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '3px 10px' }}>
            {session.user.email}
          </span>
          <button onClick={() => setShowUputstvo(true)}
            title="Uputstvo za korišćenje"
            style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            📖 Uputstvo
          </button>
          <button onClick={() => setShowFirmaModal(true)}
            style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            {firma?.logo
              ? <img src={firma.logo} alt="logo" style={{ height: 16, maxWidth: 40, objectFit: 'contain', borderRadius: 2, background: '#fff' }} />
              : '🏢'} Firma
          </button>
          <button onClick={odjava}
            style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            Odjava
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT PANEL */}
        <div style={{ width: 280, minWidth: 280, background: '#C7C7C4', borderRight: '1px solid #B8B8B4', overflowY: 'auto', padding: 12, flexShrink: 0 }}>

          {/* Projekti */}
          <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #1B2F43', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#1B2F43', background: '#CDD1D6', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>📁</span>Projekti</div>
          <div style={{ padding: '12px 12px 14px' }}>
          {projekti.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={aktivniProjekat?.id || ''}
                  onChange={e => setAktivniProjekat(projekti.find(p => p.id === e.target.value) || null)}
                  style={{ flex: 1, minWidth: 0, border: '1px solid #C7CDD3', borderRadius: 6, padding: '7px 8px', fontSize: 13, fontFamily: 'inherit', background: '#EEF0F2', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <option value="" disabled>— Odaberite projekat —</option>
                  {projekti.map(p => <option key={p.id} value={p.id}>{p.naziv}</option>)}
                </select>
                {aktivniProjekat && (
                  <>
                    <button onClick={klonirajProjekat} disabled={kloniranjeLoading} title="Kloniraj projekat"
                      style={{ background: '#E8ECF0', border: '1px solid #4A637C', borderRadius: 6, color: '#1B2F43', cursor: kloniranjeLoading ? 'not-allowed' : 'pointer', fontSize: 15, padding: '6px 10px', fontFamily: 'inherit', flexShrink: 0 }}>⧉</button>
                    <button onClick={() => obrisiProjekat(aktivniProjekat.id)} title="Obriši ovaj projekat"
                      style={{ background: '#FBE4E1', border: '1px solid #E8A5A0', borderRadius: 6, color: '#C0392B', cursor: 'pointer', fontSize: 16, padding: '6px 10px', fontFamily: 'inherit', flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#FBE4E1'; e.currentTarget.style.color = '#C0392B' }}>🗑</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Još nema projekata.</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14 }}>
            <input type="text" value={noviProjekat} onChange={e => setNoviProjekat(e.target.value)}
              ref={noviProjekatInputRef}
              spellCheck={false}
              onKeyDown={e => e.key === 'Enter' && dodajProjekat()}
              placeholder="Novi projekat..."
              style={{ flex: 1, minWidth: 0, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
            <button onClick={dodajProjekat} style={B('#556575')}>+ Dodaj</button>
          </div>
          <input type="file" accept="application/json,.json" ref={uvozInputRef} style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) ucitajProjekatIzFajla(file)
              e.target.value = ''
            }} />
          <button onClick={() => uvozInputRef.current?.click()} disabled={uvozLoading}
            style={{ width: '100%', background: 'transparent', border: '1px dashed #C8C5BD', borderRadius: 6, padding: '7px 0', fontSize: 12, color: uvozLoading ? '#bbb' : '#666', cursor: uvozLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>
            {uvozLoading ? '⏳ Uvozim projekat...' : '📥 Uvezi projekat iz fajla'}
          </button>
          </div>
          </div>

          {/* Podaci o projektu */}
          {aktivniProjekat && <>
            <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #4A637C', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#3D5468', background: '#D7DDE2', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>📋</span>Podaci o projektu</div>
            <div style={{ padding: '12px 12px 14px' }}>
            {[['naziv', 'Naziv projekta'], ['klijent', 'Investitor'], ['adresa', 'Lokacija']].map(([k, lbl]) => (
              <div key={k} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{lbl}</div>
                <input type="text" key={`${aktivniProjekat.id}-${k}`} defaultValue={aktivniProjekat[k] || ''} onBlur={e => azurirajProjekat(k, e.target.value)}
                  spellCheck={false}
                  style={{ width: '100%', border: '1px solid #4A637C', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: '#1B2F43', fontFamily: 'inherit', background: '#DCE6F1', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Datum</div>
              <input type="date" key={`${aktivniProjekat.id}-datum`} defaultValue={aktivniProjekat.datum || ''} onBlur={e => azurirajProjekat('datum', e.target.value)}
                style={{ width: '100%', border: '1px solid #4A637C', borderRadius: 6, padding: '5px 8px', fontSize: 13, fontWeight: 700, color: '#1B2F43', fontFamily: 'inherit', background: '#DCE6F1' }} />
            </div>
            </div>
            </div>
          </>}

          {/* Struke (discipline) */}
          {aktivniProjekat && <>
            <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #6B8299', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#425A70', background: '#DEE4E9', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>🏗️</span>Faza</div>
            <div style={{ padding: '12px 12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
              {struke.map(s => (
                <div key={s.kod} onClick={() => {
                    // Ako je već aktivna ova ista struka, ne diraj ništa (izbjegava nepotreban re-fetch pozicija)
                    if (s.kod === aktivnaStruka) return
                    setAktivnaStruka(s.kod)
                    // Izaberi grupu radova nove struke: prvo pokušaj onu koju je korisnik
                    // POSLJEDNJU gledao baš u ovoj struci (s.zadnjaFazaId), a tek ako ne postoji
                    // (nova struka, obrisana grupa) padni nazad na prvu — ista logika kao pri
                    // otvaranju projekta (vidi ucitajFaze), samo bez ponovnog dohvata iz baze
                    // jer su sve grupe radova projekta već učitane u "faze".
                    const fazeUStruci = faze.filter(f => (f.struka_kod || 'gradjevinski') === s.kod)
                    const zapamcena = s.zadnjaFazaId ? fazeUStruci.find(f => f.id === s.zadnjaFazaId) : null
                    const izabrana = zapamcena || fazeUStruci[0] || null
                    setAktivnaFaza(izabrana)
                    if (!izabrana) setPozicije([])
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                    background: s.kod === aktivnaStruka ? '#556575' : 'transparent',
                    border: s.kod === aktivnaStruka ? '1px solid #556575' : '1px solid #E8E5DC' }}
                  onMouseEnter={e => { if (s.kod !== aktivnaStruka) e.currentTarget.style.background = '#F0F2F5' }}
                  onMouseLeave={e => { if (s.kod !== aktivnaStruka) e.currentTarget.style.background = '' }}>
                  {editStrukaKod === s.kod ? (
                    <input type="text" defaultValue={s.naziv} spellCheck={false} autoFocus
                      onClick={e => e.stopPropagation()}
                      onBlur={e => { preimenujStruku(s.kod, e.target.value.trim() || s.naziv); setEditStrukaKod(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditStrukaKod(null) }}
                      style={{ flex: 1, border: '1px solid #4A637C', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontFamily: 'inherit', background: '#fff' }} />
                  ) : (
                    <span onDoubleClick={e => { e.stopPropagation(); setEditStrukaKod(s.kod) }}
                      title="Dvoklik za preimenovanje"
                      style={{ flex: 1, fontSize: 12, fontWeight: 600, color: s.kod === aktivnaStruka ? '#fff' : '#333', cursor: 'text' }}>
                      {s.naziv}
                    </span>
                  )}
                  {(s.uvecanjePct > 0 || s.umanjenjePct > 0) && (
                    <span title={`Uvećanje ${s.uvecanjePct||0}% / Umanjenje ${s.umanjenjePct||0}%`}
                      style={{ fontSize: 10, opacity: s.kod === aktivnaStruka ? 0.85 : 0.55, flexShrink: 0 }}>⚖️</span>
                  )}
                  {s.kod.startsWith('custom-') && editStrukaKod !== s.kod && (
                    <button onClick={e => { e.stopPropagation(); obrisiStruku(s.kod) }}
                      style={{ background: 'none', border: 'none', color: s.kod === aktivnaStruka ? 'rgba(255,255,255,.6)' : '#ccc', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#E88'}
                      onMouseLeave={e => e.currentTarget.style.color = s.kod === aktivnaStruka ? 'rgba(255,255,255,.6)' : '#ccc'}>×</button>
                  )}
                </div>
              ))}
              {dodajStrukuMod ? (
                <input type="text" autoFocus spellCheck={false} placeholder="Naziv nove faze..."
                  onBlur={e => { if (e.target.value.trim()) dodajStruku(e.target.value); setDodajStrukuMod(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setDodajStrukuMod(false) }}
                  style={{ border: '1px solid #4A637C', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
              ) : (
                <button onClick={() => setDodajStrukuMod(true)}
                  style={{ background: 'transparent', border: '1px dashed #C8C5BD', borderRadius: 6, padding: '6px 8px', fontSize: 11.5, color: '#888', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  + Nova faza (vlastita)
                </button>
              )}
            </div>
            </div>
            </div>
          </>}

          {/* Faze */}
          {aktivniProjekat && <>
            <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #8A9BAC', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#4C5E6E', background: '#E5E9ED', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>📦</span>Grupe radova</div>
            <div style={{ padding: '12px 12px 14px' }}>
            {(() => {
              const fazeUFazi = faze.filter(f => (f.struka_kod || 'gradjevinski') === aktivnaStruka)
              const aktivnaPripada = aktivnaFaza && fazeUFazi.some(f => f.id === aktivnaFaza.id)
              const dodate = new Set(fazeUFazi.map(f => f.kategorija).filter(Boolean))
              const dostupne = KATEGORIJE.filter(k => strukaZaKategoriju(k) === aktivnaStruka && !dodate.has(k))
              const prefiks = f => (f.kategorija && SIFRA_KATEGORIJE_MAP.get(f.kategorija)) ? SIFRA_KATEGORIJE_MAP.get(f.kategorija) + ' · ' : ''
              // JEDNA lista radi oboje: sekcija „Vaše grupe radova" prebacuje aktivnu grupu, a
              // „Dodaj grupu iz šifarnika" dodaje novu. Vrijednost 'add::<kategorija>' razlikuje
              // dodavanje od prebacivanja. Custom grupe se dodaju poljem ispod i pojave se na kraju
              // gornje sekcije (jer im poredakFaze daje najveći redni broj).
              return (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <select value={aktivnaPripada ? aktivnaFaza.id : ''}
                    onChange={e => {
                      const v = e.target.value
                      if (!v) return
                      if (v.startsWith('add::')) dodajFazu(v.slice(5), v.slice(5))
                      else setAktivnaFaza(fazeUFazi.find(f => f.id === v) || null)
                    }}
                    style={{ flex: 1, minWidth: 0, border: '1px solid #C7CDD3', borderRadius: 6, padding: '7px 8px', fontSize: 13, fontFamily: 'inherit', background: '#EEF0F2', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <option value="" disabled>{fazeUFazi.length ? '— Odaberite ili dodajte grupu —' : '➕ Dodaj grupu radova…'}</option>
                    {fazeUFazi.length > 0 && (
                      <optgroup label="Vaše grupe radova" style={{ background: '#F6E0DA' }}>
                        {fazeUFazi.map(f => <option key={f.id} value={f.id} style={{ background: '#F6E0DA', color: '#6B392F' }}>{prefiks(f)}{f.naziv}</option>)}
                      </optgroup>
                    )}
                    {dostupne.length > 0 && (
                      <optgroup label="➕ Dodaj grupu iz šifarnika" style={{ background: '#E6F2FD' }}>
                        {dostupne.map(k => <option key={'add::' + k} value={'add::' + k} style={{ background: '#E6F2FD', color: '#12324F' }}>{(SIFRA_KATEGORIJE_MAP.get(k) || '')} · {k}</option>)}
                      </optgroup>
                    )}
                  </select>
                  {aktivnaPripada && (
                    <button onClick={() => obrisiFeazu(aktivnaFaza.id)} title="Obriši ovu grupu radova"
                      style={{ background: '#FBE4E1', border: '1px solid #E8A5A0', borderRadius: 6, color: '#C0392B', cursor: 'pointer', fontSize: 16, padding: '6px 10px', fontFamily: 'inherit', flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#FBE4E1'; e.currentTarget.style.color = '#C0392B' }}>🗑</button>
                  )}
                </div>
              )
            })()}
            <div style={{ marginBottom: 16 }}>
              {/* Prilagođena (custom) grupa — slobodan naziv, vidi cijelu bazu, ide na kraj liste */}
              <div style={{ fontSize: 10.5, color: '#aaa', marginBottom: 3 }}>ili prilagođena grupa (van šifarnika):</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={novaFaza} onChange={e => setNovaFaza(e.target.value)}
                  spellCheck={false}
                  onKeyDown={e => e.key === 'Enter' && dodajFazu(novaFaza)}
                  placeholder="Naziv prilagođene grupe..."
                  style={{ flex: 1, minWidth: 0, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
                <button onClick={() => dodajFazu(novaFaza)} style={B('#556575')}>+ Dodaj</button>
              </div>
            </div>
            {/* „Upravljaj mojom bazom" — kao poslednja opcija na dnu panela GRUPE RADOVA (globalna
                lična biblioteka stavki, dostupna u svim projektima; premješteno iz UVEĆANJE/UMANJENJE). */}
            <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid #E8E5DC' }}>
              <button onClick={() => setShowMojaBaza(true)}
                style={{ width: '100%', background: '#F0F2F5', color: '#1B2F43', border: '1px solid #4A637C', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⭐ Upravljaj mojom bazom ({mojeBaza.length})
              </button>
            </div>
            </div>
            </div>
          </>}

          {/* Uvećanje / Umanjenje — podešava se po fazi, ne globalno za cijeli projekat */}
          <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #C9954E', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8A6524', background: '#F4ECDD', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>⚖️</span>Uvećanje / Umanjenje</div>
          <div style={{ padding: '12px 12px 14px' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
            za fazu: <strong style={{ color: '#4A637C' }}>{struke.find(s => s.kod === aktivnaStruka)?.naziv || aktivnaStruka}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 12, color: '#666' }}>Uvećanje (%)</span>
            <input type="number" key={`uvec-${aktivniProjekat?.id}-${aktivnaStruka}`} defaultValue={struke.find(s => s.kod === aktivnaStruka)?.uvecanjePct || 0} min="0" step="0.5"
              onBlur={e => { const v = parseFloat(e.target.value) || 0; postaviUvecanjeStruke(aktivnaStruka, v) }}
              style={{ width: 55, border: '1px solid #D8D5CC', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }} />
          </div>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 10 }}>npr. PDV, opšti troškovi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 12, color: '#C0392B' }}>Umanjenje (%)</span>
            <input type="number" key={`uman-${aktivniProjekat?.id}-${aktivnaStruka}`} defaultValue={struke.find(s => s.kod === aktivnaStruka)?.umanjenjePct || 0} min="0" max="100" step="0.5"
              onBlur={e => { const v = parseFloat(e.target.value) || 0; postaviUmanjenjeStruke(aktivnaStruka, v) }}
              style={{ width: 55, border: '1px solid #f5c6c2', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right', color: '#C0392B' }} />
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>npr. popust, sopstvena režija</div>
          </div>
          </div>

          {/* Rekapitulacija */}
          <div style={{ background: '#EEF0F3', border: '1px solid #C9D3DE', borderRadius: 10, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#1B2F43', background: '#DDE0E3', padding: '9px 12px' }}><span style={{ fontSize: 15.3 }}>📊</span>Rekapitulacija</div>
          <div style={{ padding: '12px 12px 14px' }}>
          {aktivnaFaza && pozicije.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0', color: '#666' }}>{aktivnaFaza.naziv}</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600, color: '#1B2F43', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(fazaTotali[aktivnaFaza.id] || 0)} {valutaZnak}
                  </td>
                </tr>
                <tr><td colSpan={2} style={{ borderTop: '1px solid #D8D5CC', paddingTop: 5 }}></td></tr>
                {uvecanje > 0 && <tr><td style={{ color: '#1B2F43' }}>+ Uvećanje</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#1B2F43', fontVariantNumeric: 'tabular-nums' }}>+{fmt(uvecanje)} {valutaZnak}</td></tr>}
                {umanjenje > 0 && <tr><td style={{ color: '#C0392B' }}>− Umanjenje</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>−{fmt(umanjenje)} {valutaZnak}</td></tr>}
                <tr>
                  <td style={{ fontWeight: 800, fontSize: 14 }}>UKUPNO</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#1B2F43', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt((fazaTotali[aktivnaFaza.id] || 0) + uvecanje - umanjenje)} {valutaZnak}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : <p style={{ fontSize: 12, color: '#aaa' }}>Odaberite grupu radova.</p>}
          </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!aktivniProjekat ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
              <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', background: '#fff', borderRadius: 14, padding: '42px 36px', boxShadow: '0 2px 10px rgba(0,0,0,.08)' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4A637C" strokeWidth="1.6"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 11v6M9 14h6"/></svg>
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#1B2F43', marginBottom: 8 }}>
                  {projekti.length === 0 ? 'Kreirajte prvi projekat' : 'Izaberite ili kreirajte projekat'}
                </div>
                <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: 22, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                  {projekti.length === 0
                    ? 'Nemate još nijedan projekat. Kreirajte prvi da počnete unos predmjera.'
                    : 'Otvorite postojeći projekat sa liste ispod, ili kreirajte novi.'}
                </div>

                {projekti.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22, textAlign: 'left' }}>
                    {projekti.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => setAktivniProjekat(p)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: '1px solid #E5E2D8', borderRadius: 8, padding: '10px 12px', background: '#F5F4F0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EEF0F2'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F5F4F0'}>
                        <span style={{ fontSize: 15 }}>📁</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2F43', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naziv}</span>
                        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>Otvori →</span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => { noviProjekatInputRef.current?.focus(); noviProjekatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                    style={{ background: '#1B2F43', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Novi projekat
                  </button>
                  <button onClick={() => uvozInputRef.current?.click()}
                    style={{ background: '#fff', color: '#1B2F43', border: '1px solid #C7CDD3', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    📥 Uvezi projekat
                  </button>
                </div>
              </div>
            </div>
          ) : !aktivnaFaza ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#aaa' }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <p style={{ fontSize: 15 }}>Dodajte ili odaberite grupu radova</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div style={{ background: '#556575', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.15)', margin: '12px 12px 10px 12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                {editFazaNazivMjesto === 'toolbar' ? (
                  <input type="text" defaultValue={aktivnaFaza.naziv} spellCheck={false} autoFocus
                    onBlur={async e => { await preimenujFazu(aktivnaFaza.id, e.target.value || aktivnaFaza.naziv); setEditFazaNazivMjesto(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditFazaNazivMjesto(null) }}
                    style={{ fontWeight: 700, fontSize: 15, color: '#1B2F43', border: '1px solid #4A637C', borderRadius: 4, padding: '2px 8px', fontFamily: 'inherit', background: '#fff' }} />
                ) : (
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', cursor: 'text' }}
                    onDoubleClick={() => setEditFazaNazivMjesto('toolbar')} title="Dvoklik za promjenu naziva">{aktivnaFaza.naziv}</span>
                )}
                <button onClick={opozoviZadnjuIzmjenu} disabled={istorijaIzmjena.length === 0}
                  title={istorijaIzmjena.length > 0 ? `Opozovi zadnju izmjenu (${istorijaIzmjena.length} na čekanju)` : 'Nema izmjena za opoziv'}
                  style={{ ...B('transparent', istorijaIzmjena.length === 0 ? 'rgba(255,255,255,.4)' : '#fff', '1px solid rgba(255,255,255,.5)'), cursor: istorijaIzmjena.length === 0 ? 'not-allowed' : 'pointer' }}>
                  ↩ Opozovi{istorijaIzmjena.length > 0 ? ` (${istorijaIzmjena.length})` : ''}
                </button>
                <div style={{ flex: 1 }}></div>
                {/* Valutni meni */}
                <select value={valuta} onChange={e => promijeniValutu(e.target.value)} disabled={loading}
                  title={loading ? 'Konvertujem cijene...' : (kursDatum ? `Kurs USD/RSD ažuriran: ${new Date(kursDatum).toLocaleString('sr-RS')}` : undefined)}
                  style={{ border: '1px solid rgba(255,255,255,.4)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                  {VALUTE.map(v => <option key={v.kod} value={v.kod} style={{ color: '#1B2F43' }}>Valuta ({v.kod})</option>)}
                </select>
                {/* Export dugmad sa padajućim menijem */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setExportMeni(m => m === 'excel' ? null : 'excel')} style={B('#217346')}>📊 Excel ▾</button>
                  {exportMeni === 'excel' && (
                    <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.2)', overflow: 'hidden', zIndex: 20, minWidth: 220 }}>
                      <button onClick={() => { setExportMeni(null); exportExcel(aktivnaStruka) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff', color: '#1B2F43', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        Izvezi izabranu fazu <span style={{ color: '#888' }}>({struke.find(s => s.kod === aktivnaStruka)?.naziv})</span>
                      </button>
                      <button onClick={() => { setExportMeni(null); exportExcel(null) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #E5E2D8', background: '#fff', color: '#1B2F43', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        Izvezi kompletan predmjer
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setExportMeni(m => m === 'pdf' ? null : 'pdf')} style={B('#fff', '#1B2F43')}>🖨 Print/PDF ▾</button>
                  {exportMeni === 'pdf' && (
                    <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.2)', overflow: 'hidden', zIndex: 20, minWidth: 220 }}>
                      <button onClick={() => { setExportMeni(null); exportPDF(aktivnaStruka) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff', color: '#1B2F43', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        Štampaj izabranu fazu <span style={{ color: '#888' }}>({struke.find(s => s.kod === aktivnaStruka)?.naziv})</span>
                      </button>
                      <button onClick={() => { setExportMeni(null); exportPDF(null) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid #E5E2D8', background: '#fff', color: '#1B2F43', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        Štampaj kompletan predmjer
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={exportProjekat} title="Izvezi kompletan projekat kao fajl (za slanje kolegi na drugom nalogu)"
                  style={B('transparent', '#fff', '1px solid rgba(255,255,255,.5)')}>
                  📤 Izvezi projekat
                </button>
              </div>

              {/* Baza pretraga */}
              <div style={{ margin: '0 12px 10px 12px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.1)', overflow: 'hidden', flexShrink: 0 }}>
              <BazaPanel
                onAdd={dodajPoziciju}
                onAddFromMojaBaza={dodajIzMojeBaze}
                mojeBazaStavke={mojeBaza}
                aktivnaStruka={aktivnaStruka}
                strukaNaziv={struke.find(s => s.kod === aktivnaStruka)?.naziv || ''}
                baza={baza}
                bazaUcitavanje={bazaUcitavanje}
                onDodajVlastitu={dodajVlastitupoziciju}
                zamjenaNaziv={zamjenaPozicijaId ? (pozicije.find(p => p.id === zamjenaPozicijaId)?.naziv || '(bez naziva)') : null}
                onOtkaziZamjenu={() => setZamjenaPozicijaId(null)}
                zakljucanaKategorija={(aktivnaFaza && (aktivnaFaza.struka_kod || 'gradjevinski') === aktivnaStruka) ? (aktivnaFaza.kategorija || null) : null}
              />
              </div>

              {/* ── ZAJEDNIČKI SKROL KONTEJNER (uslovi + tabela kao jedna cjelina) ──
                  Umjesto dva odvojena skrol-okvira, uslovi i tabela idu u JEDAN scroll. Kad
                  korisnik skroluje, opšti tehnički uslovi prirodno odlaze gore "u nevidljivo" a
                  otkrivaju se stavke ispod — kao jedna duga stranica. Toolbar i pretraga baze
                  iznad ostaju fiksni. Zaglavlje kolona tabele je "sticky" (lijepi se na vrh). */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

              {/* ── OPŠTI TEHNIČKI USLOVI GRUPE RADOVA (sklopivo) ── */}
              {/* Panel je prirodne visine (bez vlastitog scroll-a) — skroluje ga zajednički
                  kontejner, zajedno sa tabelom, kao jedna cjelina. */}
              <div style={{ margin: '0 12px 10px 12px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'hidden', flexShrink: 0, border: '1px solid #D8D5CC' }}>
                <div onClick={() => setShowUslovi(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: aktivnaFaza?.opsti_uslovi ? '#EEF2F5' : '#F5F4F0', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={{ fontSize: 13 }}>{showUslovi ? '▼' : '▶'}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1B2F43', flex: 1 }}>
                    📋 Opšti tehnički uslovi grupe radova
                    {aktivnaFaza?.opsti_uslovi && <span style={{ fontSize: 10.5, fontWeight: 400, color: '#4A637C', marginLeft: 8 }}>✓ popunjeno</span>}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#999' }}>{showUslovi ? 'sakrij' : 'prikaži'}</span>
                </div>
                {showUslovi && (
                  <div style={{ padding: '10px 12px', background: '#fff', borderTop: '1px solid #E8E5DC' }}>
                    <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5, marginBottom: 8 }}>
                      Uvodni tekst koji se prikazuje prije stavki ove grupe radova u Excel i PDF izvještaju
                      (tehnički uslovi, način obračuna, kvalitet, normativi). Opcion — možete ga ostaviti prazan.
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {sablonZaAktivnuFazu() && (
                        <button onClick={async () => {
                            const sablon = sablonZaAktivnuFazu()
                            if (!sablon) return
                            if (aktivnaFaza?.opsti_uslovi && !confirm('Zamijeniti postojeći tekst uslova predefinisanim šablonom?')) return
                            await sacuvajUslove(aktivnaFaza.id, sablon)
                            setRevizija(r => r + 1) // remount textarea da odmah prikaže ubačeni šablon
                          }}
                          style={{ background: '#1B2F43', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          📥 Ubaci šablon za ovu grupu
                        </button>
                      )}
                      <button onClick={() => zatraziAIUslove()}
                        title="AI asistent će automatski predložiti opšte tehničke uslove za ovu grupu radova"
                        style={{ background: '#F0F2F5', color: '#1B2F43', border: '1px solid #4A637C', borderRadius: 6, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✨ AI predlog uslova
                      </button>
                      {aktivnaFaza?.opsti_uslovi && (
                        <button onClick={async () => { if (confirm('Obrisati opšte tehničke uslove ove grupe radova?')) { await sacuvajUslove(aktivnaFaza.id, ''); setRevizija(r => r + 1) } }}
                          style={{ background: 'transparent', color: '#C0392B', border: '1px solid #f5c6c2', borderRadius: 6, padding: '6px 12px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🗑 Obriši
                        </button>
                      )}
                    </div>
                    {/* Traka za vraćanje obrisanih/zamijenjenih uslova — pojavljuje se kad se izgubi
                        prethodni tekst (brisanje ili zamjena šablonom/AI predlogom), za slučaj greške. */}
                    {opozivUslova && opozivUslova.fazaId === aktivnaFaza.id && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFF8E8', border: '1px solid #E8D9B0', borderRadius: 8, padding: '7px 12px', marginBottom: 8 }}>
                        <span style={{ fontSize: 11.5, color: '#8A6524', flex: 1 }}>Prethodni tekst uslova je promijenjen.</span>
                        <button onClick={vratiObrisaneUslove}
                          style={{ background: '#C9954E', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          ↩ Vrati prethodni tekst
                        </button>
                      </div>
                    )}
                    <textarea
                      key={`uslovi-${aktivnaFaza.id}-${revizija}`}
                      ref={el => { if (el && aktivnaFaza?.opsti_uslovi) autoGrowTextarea(el) }}
                      defaultValue={aktivnaFaza?.opsti_uslovi || ''}
                      spellCheck={false}
                      onInput={e => autoGrowTextarea(e.target)}
                      onDoubleClick={e => autoGrowTextarea(e.currentTarget)}
                      onBlur={e => {
                        // Sačuvaj SAMO ako se sadržaj polja stvarno razlikuje od onoga što je
                        // trenutno u fazi. Bez ove provjere, ako korisnik obriše uslove drugim
                        // dugmetom ("Obriši"), blur ovog polja bi vratio (vaskrsnuo) stari tekst
                        // nazad u bazu. Čitamo aktuelnu vrijednost iz aktivnaFaza u trenutku blur-a.
                        const novo = (e.target.value || '').trim()
                        const trenutno = (aktivnaFaza?.opsti_uslovi || '').trim()
                        if (novo !== trenutno) sacuvajUslove(aktivnaFaza.id, e.target.value)
                      }}
                      title="Ćelija se automatski širi dok kucate; dvoklik ponovo namješta visinu cijelom tekstu"
                      placeholder="Upišite opšte tehničke uslove za ovu grupu radova, ili kliknite 'Ubaci šablon' / 'AI predlog uslova' iznad..."
                      style={{ width: '100%', minHeight: 120, border: '1px solid #D8D5CC', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', background: '#FAFAF8', color: '#2B2B26', overflow: 'hidden' }} />
                  </div>
                )}
              </div>

              {/* Tabela — bez vlastitog scroll-a; skroluje je zajednički kontejner iznad. */}
              <div style={{ padding: '0 12px 12px 12px' }}>
                {pozicije.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', color: '#888' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 6 }}>Faza je prazna</div>
                    <div style={{ fontSize: 12 }}>Pretražite bazu iznad i kliknite na poziciju da je dodate.</div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.07)', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#556575', color: '#fff' }}>
                        {['R.br.', 'Šifra', 'Opis pozicije', 'J.mj.', `Jed. cijena (${valutaZnak})`, 'Količina', `Ukupno (${valutaZnak})`, ''].map((h, i) => (
                          <th key={i} style={{ padding: '9px 8px', textAlign: i >= 4 && i <= 6 ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#556575', zIndex: 3 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(grouped).map(([kat, poz]) => (
                        <React.Fragment key={kat}>
                          <tr key={'k' + kat} style={{ background: '#DCE3EA' }}>
                            <td colSpan={8} style={{ padding: '7px 8px 7px 14px', fontWeight: 700, fontSize: 11, color: '#1B2F43', textTransform: 'uppercase', letterSpacing: '.05em', borderLeft: '4px solid #2D4B6A' }}>{kat}</td>
                          </tr>
                          {poz.map((p, i) => {
                            const u = calcRow(p, pozicije)
                            const djeca = podstavke[p.id] || []
                            const imadjece = djeca.length > 0
                            // Naizmjenično sjenčanje po stavki (main + podstavke + zbir dijele istu paletu)
                            const paleta = i % 2 === 1
                              ? { glavna: '#DCE3EA', pod: '#D5DEE6', zbir: '#CDD8E1' }
                              : { glavna: '#F3F6F9', pod: '#EFF3F6', zbir: '#E9EEF2' }
                            const hoverBg = '#FFFBEA'
                            const jeArmiranoZaZamjenu = zamjenaPozicijaId === p.id
                            return (
                              <React.Fragment key={p.id}>
                                {/* GLAVNA STAVKA */}
                                <tr
                                  draggable
                                  onDragStart={e => onDragStart(e, p)}
                                  onDragEnd={onDragEnd}
                                  onDragOver={e => onDragOver(e, p)}
                                  onDrop={e => onDrop(e, p)}
                                  style={{ borderBottom: imadjece ? 'none' : '2px solid #E4E1D8', background: jeArmiranoZaZamjenu ? '#FFF3D6' : paleta.glavna, cursor: 'grab', outline: jeArmiranoZaZamjenu ? '2px solid #C9954E' : 'none', outlineOffset: '-2px' }}
                                  onMouseEnter={e => { if (!jeArmiranoZaZamjenu) e.currentTarget.style.background = hoverBg }}
                                  onMouseLeave={e => { e.currentTarget.style.background = jeArmiranoZaZamjenu ? '#FFF3D6' : paleta.glavna }}>
                                  <td style={{ padding: '6px 8px', color: '#1A1A18', fontWeight: 700, fontSize: 13, width: 28, verticalAlign: 'top', borderRadius: imadjece ? '6px 0 0 0' : '6px 0 0 6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A18' }}>{i + 1}</span>
                                      <span className="drag-rucka" onMouseDown={() => { dragRuckaAktivna.current = true }} style={{ color: '#ccc', fontSize: 12, lineHeight: 1, userSelect: 'none', cursor: 'grab' }} title="Prevuci da promijeniš redoslijed">⠿</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', verticalAlign: 'top', width: 82, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    <input
                                      type="text"
                                      spellCheck={false}
                                      className="sifra-input"
                                      key={`sif-${p.id}-${revizija}`}
                                      defaultValue={p.sifra || ''}
                                      placeholder="šifra"
                                      onBlur={e => azurirajPoziciju(p.id, 'sifra', e.target.value.trim())}
                                      onClick={e => e.stopPropagation()}
                                      style={{ width: '100%', border: '1px solid transparent', background: 'transparent', fontSize: 11, fontStyle: 'italic', fontWeight: 600, color: '#6B7480', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', padding: '2px 4px', borderRadius: 4 }}
                                      onFocus={e => { e.target.style.border = '1px solid #C2CDD8'; e.target.style.background = '#fff' }}
                                      title="Šifra pozicije" />
                                  </td>
                                  <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 280, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    <textarea
                                      key={`naz-${p.id}-${revizija}`}
                                      spellCheck={false}
                                      ref={el => {
                                        if (el) {
                                          el._pozId = p.id
                                          // Ako nema sačuvane visine, odmah pri prikazu izmjeri tačnu potrebnu
                                          // visinu za postojeći tekst (umjesto da se oslanjamo samo na grubu
                                          // rows procjenu ispod dok korisnik prvi put ne otkuca nešto).
                                          if (!p.opis_visina) autoGrowTextarea(el)
                                        }
                                      }}
                                      defaultValue={p.naziv || ''}
                                      onInput={e => autoGrowTextarea(e.target)}
                                      onBlur={e => {
                                        azurirajPoziciju(p.id, 'naziv', e.target.value)
                                        // Ako je korisnik (ručno ili copy-paste) upisao opis koji jasno kaže
                                        // jedinicu obračuna ("Obračun po m." / "kg" / "litar" / "paušalno"...),
                                        // jedinica u tabeli se automatski prilagođava — bez ovoga bi opis i
                                        // jedinica ostali neusklađeni dok korisnik to sam ne ispravi ručno.
                                        const prepoznata = prepoznajJedinicu(e.target.value)
                                        if (prepoznata && p.jedinica !== prepoznata) {
                                          azurirajPoziciju(p.id, 'jedinica', prepoznata)
                                          setRevizija(r => r + 1) // forsira select da prikaže novu jedinicu (koristi defaultValue)
                                        }
                                        // Sačuvaj trenutnu visinu — auto-grow (onInput) je već namjestio tačnu
                                        // visinu dok je korisnik kucao, ovdje je samo trajno upisujemo u bazu
                                        // (hvata i ručno povlačenje ivice, ne samo kucanje)
                                        const trenutnaVisina = e.target.offsetHeight
                                        if (trenutnaVisina && trenutnaVisina !== p.opis_visina) {
                                          azurirajPoziciju(p.id, 'opis_visina', trenutnaVisina)
                                        }
                                        e.target.style.border = '1px solid transparent'
                                        e.target.style.background = 'transparent'
                                        skupiOpis(p.id) // opcija B: opis se sam skupi kad se klikne van polja
                                      }}
                                      rows={Math.max(2, Math.ceil((p.naziv||'').length / 65))}
                                      onClick={e => e.stopPropagation()}
                                      onDoubleClick={e => {
                                        e.preventDefault()
                                        const potrebno = autoGrowTextarea(e.currentTarget)
                                        // Odmah sačuvaj u bazu da ostane trajno podešeno
                                        azurirajPoziciju(p.id, 'opis_visina', potrebno)
                                      }}
                                      title="Ćelija se automatski širi dok kucate; dvoklik ponovo namješta visinu tekstu"
                                      style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minHeight: 40, height: p.opis_visina ? `${p.opis_visina}px` : undefined, maxHeight: (jeDugOpis(p) && !prosireniOpisi.has(p.id)) ? 78 : 'none', overflow: (jeDugOpis(p) && !prosireniOpisi.has(p.id)) ? 'hidden' : undefined, color: '#2B2B26' }}
                                      onFocus={e => { prosiriOpis(p.id); e.target.style.border = '1px solid #4A637C'; e.target.style.background = '#F8FAF8' }}
                                      onKeyDown={e => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                                          e.preventDefault()
                                          const t = e.target
                                          const start = t.selectionStart
                                          const end = t.selectionEnd
                                          if (start === end) return
                                          const sel = t.value.slice(start, end)
                                          const before = t.value.slice(0, start)
                                          const after = t.value.slice(end)
                                          const novi = before + '**' + sel + '**' + after
                                          // Direktno azuriraj DOM bez React re-rendera
                                          t.value = novi
                                          t.selectionStart = start + 2
                                          t.selectionEnd = end + 2
                                          autoGrowTextarea(t)
                                          // Azuriraj bazu (ali ne state da ne re-renderuje)
                                          azurirajPoziciju(p.id, 'naziv', novi)
                                        }
                                      }}
                                    />
                                    {jeDugOpis(p) && (
                                      <div style={{ textAlign: 'right', marginTop: 1 }}>
                                        <button onClick={e => { e.stopPropagation(); toggleOpis(p.id) }}
                                          style={{ background: 'none', border: 'none', color: '#AEB4BA', fontSize: 9.5, fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit', padding: '0 3px', letterSpacing: '.02em' }}
                                          onMouseEnter={e => e.currentTarget.style.color = '#6B7580'}
                                          onMouseLeave={e => e.currentTarget.style.color = '#AEB4BA'}>
                                          {prosireniOpisi.has(p.id) ? '▴ skrati' : '▾ prikaži cijelo'}
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    {!imadjece && <select
                                      key={`jed-${p.id}-${revizija}`}
                                      defaultValue={fmtJmj(p.jedinica)||'m²'}
                                      onChange={e => azurirajPoziciju(p.id, 'jedinica', e.target.value)}
                                      style={{ width: 58, border: '1px solid transparent', borderRadius: 4, padding: '2px 2px', fontSize: 11, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' }}
                                      onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                      onBlur={e => e.target.style.border = '1px solid transparent'}>
                                      {['m²','m³','m','kom.','pau.','kg','t','l','h','dan','voz','m²/dan'].map(j => (
                                        <option key={j} value={j}>{j}</option>
                                      ))}
                                    </select>}
                                    {imadjece && <span style={{ fontSize: 11, color: '#888' }}>{fmtJmj(p.jedinica)}</span>}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    {!imadjece && <input key={`cij-${p.id}-${revizija}`} type="number" defaultValue={p.cijena || ''} onBlur={e => azurirajPoziciju(p.id, 'cijena', parseFloat(e.target.value) || 0)}
                                      style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />}
                                    {imadjece && <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>zbir podstavki</span>}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    {!imadjece && <input key={`kol-${p.id}-${revizija}`} type="number" defaultValue={p.kolicina || ''} onBlur={e => azurirajPoziciju(p.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                      placeholder="0" min="0" step="any"
                                      style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1B2F43', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    {u > 0 ? fmt(u) + ' ' + valutaZnak : '—'}
                                  </td>
                                  <td style={{ padding: '6px 4px', verticalAlign: 'top', borderRadius: imadjece ? '0 6px 0 0' : '0 6px 6px 0', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    <div style={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                                      <button onClick={() => dodajPodstavku(p)} title="Dodaj podstavku (sprat/zona)"
                                        style={{ background: '#E8ECF0', border: '1px solid #4A637C', cursor: 'pointer', color: '#1B2F43', fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        + pod
                                      </button>
                                      <div className="red-akcije" style={{ display: 'flex', gap: 2 }}>
                                        <button onClick={() => setZamjenaPozicijaId(prev => prev === p.id ? null : p.id)}
                                          title={zamjenaPozicijaId === p.id ? 'Otkaži zamjenu' : (imadjece ? 'Zamijeni ovu stavku novom iz baze (briše postojeće podstavke)' : 'Zamijeni ovu stavku novom iz baze')}
                                          style={{ background: zamjenaPozicijaId === p.id ? '#F4B740' : 'none', border: zamjenaPozicijaId === p.id ? '1px solid #C9954E' : 'none', cursor: 'pointer', fontSize: 13, padding: '1px 2px', borderRadius: 3, opacity: zamjenaPozicijaId === p.id ? 1 : 0.6 }}
                                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                          onMouseLeave={e => { if (zamjenaPozicijaId !== p.id) e.currentTarget.style.opacity = '0.6' }}>🔁</button>
                                        <button onClick={() => sacuvajUMojuBazu(p)} title="Sačuvaj u moju bazu"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '1px 2px', borderRadius: 3, opacity: 0.6 }}
                                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>⭐</button>
                                        <button onClick={() => obrisiPoziciju(p.id)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#333', fontSize: 18, lineHeight: 1, padding: '1px 3px', borderRadius: 3 }}
                                          onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.background = '#fdf0ef' }}
                                          onMouseLeave={e => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = '' }}>×</button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* PODSTAVKE */}
                                {djeca.map((d, di) => {
                                  const du = calcRowSimple(d)
                                  return (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #EDEAE1', background: paleta.pod }}>
                                      <td style={{ padding: '4px 8px', color: '#333', fontWeight: 600, textAlign: 'center', fontSize: 12, width: 28, background: paleta.pod }}>{i+1}.{di+1}</td>
                                      <td style={{ width: 82, background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}></td>
                                      <td style={{ padding: '4px 8px 4px 24px', verticalAlign: 'top', background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                          
                                          <textarea
                                            key={`podnaz-${d.id}-${revizija}`}
                                            spellCheck={false}
                                            ref={el => { if (el && !d.opis_visina) autoGrowTextarea(el) }}
                                            defaultValue={d.naziv || ''}
                                            onInput={e => autoGrowTextarea(e.target)}
                                            onBlur={e => {
                                              // Snimi u bazu i azuriraj stil
                                              azurirajPoziciju(d.id, 'naziv', e.target.value)
                                              // Isti auto-ispravak jedinice kao kod glavne stavke — vidi komentar gore.
                                              const prepoznata = prepoznajJedinicu(e.target.value)
                                              if (prepoznata && d.jedinica !== prepoznata) {
                                                azurirajPoziciju(d.id, 'jedinica', prepoznata)
                                                setRevizija(r => r + 1)
                                              }
                                              // Sačuvaj i trenutnu visinu — isti mehanizam kao kod glavne stavke,
                                              // tako da tekst podstavke sad isto raste ispred korisnika dok kuca
                                              // (Enter dodaje red i ćelija se odmah proširi), umjesto da se sadržaj
                                              // sakrije iznad vidljivog dijela jednoredne ćelije.
                                              const trenutnaVisina = e.target.offsetHeight
                                              if (trenutnaVisina && trenutnaVisina !== d.opis_visina) {
                                                azurirajPoziciju(d.id, 'opis_visina', trenutnaVisina)
                                              }
                                              e.target.style.border = '1px solid transparent'
                                              e.target.style.background = 'transparent'
                                              skupiOpis(d.id) // opcija B: sam se skupi kad se klikne van polja
                                            }}
                                            rows={1}
                                            placeholder="Npr: Prizemlje, Sprat 1, Zona A..."
                                            style={{ flex: 1, border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', lineHeight: 1.4, color: '#444', minHeight: 22, height: d.opis_visina ? `${d.opis_visina}px` : undefined, maxHeight: (jeDugOpis(d) && !prosireniOpisi.has(d.id)) ? 60 : 'none', overflow: (jeDugOpis(d) && !prosireniOpisi.has(d.id)) ? 'hidden' : undefined }}
                                            onFocus={e => { prosiriOpis(d.id); e.target.style.border = '1px solid #4A637C'; e.target.style.background = '#F0F2F5' }}
                                          />
                                          {jeDugOpis(d) && (
                                            <button onClick={e => { e.stopPropagation(); toggleOpis(d.id) }} title={prosireniOpisi.has(d.id) ? 'Skrati' : 'Prikaži cijelo'}
                                              style={{ background: 'none', border: 'none', color: '#AEB4BA', fontSize: 9.5, fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit', padding: '0 3px', whiteSpace: 'nowrap', flexShrink: 0 }}
                                              onMouseEnter={e => e.currentTarget.style.color = '#6B7580'}
                                              onMouseLeave={e => e.currentTarget.style.color = '#AEB4BA'}>
                                              {prosireniOpisi.has(d.id) ? '▴' : '▾'}
                                            </button>
                                          )}
                                         </div>
                                       </td>
                                      <td style={{ padding: '4px 8px', color: '#888', textAlign: 'center', fontSize: 11, background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <select
                                          key={`jed-${d.id}-${revizija}`}
                                          defaultValue={fmtJmj(d.jedinica)||'m²'}
                                          onChange={e => azurirajPoziciju(d.id, 'jedinica', e.target.value)}
                                          style={{ width: 52, border: '1px solid transparent', borderRadius: 4, padding: '2px 2px', fontSize: 10, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' }}
                                          onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                          onBlur={e => e.target.style.border = '1px solid transparent'}>
                                          {['m²','m³','m','kom.','pau.','kg','t','l','h','dan','voz','m²/dan'].map(j => (
                                            <option key={j} value={j}>{j}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <input key={`cij-${d.id}-${revizija}`} type="number" defaultValue={d.cijena || ''} onBlur={e => azurirajPoziciju(d.id, 'cijena', parseFloat(e.target.value) || 0)}
                                          style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <input key={`kol-${d.id}-${revizija}`} type="number" defaultValue={d.kolicina || ''} onBlur={e => azurirajPoziciju(d.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                          placeholder="0" min="0" step="any"
                                          style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#4A637C', fontSize: 11, fontVariantNumeric: 'tabular-nums', background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        {du > 0 ? fmt(du) + ' ' + valutaZnak : '—'}
                                      </td>
                                      <td style={{ padding: '4px 4px', background: paleta.pod, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <button onClick={() => obrisiPoziciju(d.id)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#333', fontSize: 16, lineHeight: 1, padding: '1px 3px', borderRadius: 3 }}
                                          onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.background = '#fdf0ef' }}
                                          onMouseLeave={e => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = '' }}>×</button>
                                      </td>
                                    </tr>
                                  )
                                })}

                                {/* RED SA UKUPNO PODSTAVKI */}
                                {imadjece && (
                                  <tr style={{ borderBottom: '2px solid #E4E1D8', background: paleta.zbir }}>
                                    <td style={{ borderRadius: '0 0 0 6px' }}></td>
                                    <td></td>
                                    <td colSpan={4} style={{ padding: '3px 8px 3px 24px', fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                                      Ukupno: {djeca.reduce((s,d) => s + (parseFloat(d.kolicina)||0), 0).toFixed(2)} {fmtJmj(p.jedinica)}
                                    </td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700, color: '#1B2F43', fontSize: 12, borderTop: '1px solid #D8D5CC', fontVariantNumeric: 'tabular-nums' }}>
                                      {fmt(u)} {valutaZnak}
                                    </td>
                                    <td style={{ borderRadius: '0 0 6px 0' }}></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </React.Fragment>
                      ))}
                      <tr style={{ background: '#E4E9EE', borderTop: '2px solid #2D4B6A' }}>
                        <td colSpan={6} style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1B2F43', letterSpacing: '.02em' }}>UKUPNO GRUPA:</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#1B2F43', fontVariantNumeric: 'tabular-nums', background: '#D6DFE8', borderRadius: 6 }}>{fmt(fazaTotali[aktivnaFaza.id] || 0)} {valutaZnak}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              </div>{/* ── kraj ZAJEDNIČKOG SKROL KONTEJNERA (uslovi + tabela) ── */}
            </>
          )}
        </div>
      </div>

      {/* Moja baza modal */}
      {showMojaBaza && (
        <MojaBaza
          jedinice={JEDINICE_OPCIJE}
          kategorije={KATEGORIJE}
          sifre={SIFRA_KATEGORIJE_MAP}
          onClose={() => { setShowMojaBaza(false); ucitajMojuBazu() }}
          onDodaj={item => { dodajIzMojeBaze({ n: item.naziv, c: item.cijena, m: item.jedinica, k: item.kategorija, v: item.valuta }); setShowMojaBaza(false) }}
        />
      )}

      {/* ── MODAL: POSTAVKE FIRME (logo + naziv za PDF zaglavlje) ── */}
      {showFirmaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 420, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#1B2F43', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>🏢 Postavke firme</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Logo i naziv se pojavljuju u zaglavlju PDF/Print izvještaja</div>
              </div>
              <button onClick={() => setShowFirmaModal(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Preview / Upload loga */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Logo firme</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 100, height: 70, border: '1px dashed #D8D5CC', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8', flexShrink: 0, overflow: 'hidden' }}>
                    {firma?.logo
                      ? <img src={firma.logo} alt="logo firme" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: 24, opacity: 0.3 }}>🏢</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <label style={{ background: '#1B2F43', color: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: firmaLoading ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: firmaLoading ? 0.6 : 1 }}>
                      {firmaLoading ? 'Učitavanje...' : (firma?.logo ? '📤 Promijeni sliku' : '📤 Upload slike')}
                      <input type="file" accept="image/*" disabled={firmaLoading} style={{ display: 'none' }}
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          try {
                            const dataUrl = await resizeSlika(file)
                            await sacuvajFirmu(dataUrl, undefined)
                          } catch (err) {
                            alert(err.message || 'Greška pri obradi slike.')
                          }
                          e.target.value = ''
                        }} />
                    </label>
                    {firma?.logo && (
                      <button onClick={obrisiLogo} disabled={firmaLoading}
                        style={{ background: 'none', border: '1px solid #f5c6c2', color: '#C0392B', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        🗑 Ukloni logo
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>Preporučeno: PNG sa providnom pozadinom. Slika se automatski optimizuje.</div>
              </div>

              {/* Naziv firme */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Naziv firme (opciono)</div>
                <input type="text" defaultValue={firma?.naziv || ''} placeholder="npr. Gradnja d.o.o."
                  spellCheck={false}
                  onBlur={e => sacuvajFirmu(undefined, e.target.value.trim() || null)}
                  style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0' }} />
                <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>Prikazuje se u podnožju svake stranice PDF izvještaja, uz broj stranice.</div>
              </div>
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid #E8E5DC', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFirmaModal(false)}
                style={{ background: '#1B2F43', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Gotovo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAKA ZA OPOZIV BRISANJA POZICIJE ── */}
      {otkazivanjeBrisanja && (
        <div style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 298,
          background: '#1B2F43', color: '#fff', borderRadius: 10,
          padding: '10px 10px 10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', fontSize: 13
        }}>
          <span>🗑 Stavka obrisana{otkazivanjeBrisanja.djeca.length > 0 ? ` (i ${otkazivanjeBrisanja.djeca.length} podstavki)` : ''}</span>
          <button onClick={opozoviBrisanje}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            ↩ Opozovi
          </button>
          <button onClick={() => { clearTimeout(otkazivanjeBrisanja.timeoutId); setOtkazivanjeBrisanja(null) }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 15, padding: '0 2px' }}>✕</button>
        </div>
      )}

      {/* ── AI ASISTENT PLUTAJUĆE DUGME ── */}
      <button
        onClick={() => setShowAI(prev => !prev)}
        title="AI Asistent za predmjer"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 299,
          width: 56, height: 56, borderRadius: '50%',
          background: showAI ? '#142536' : 'linear-gradient(135deg, #1B2F43, #2D4B6A)',
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 24, boxShadow: '0 4px 20px rgba(27,67,50,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', transform: showAI ? 'rotate(45deg)' : 'none'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = showAI ? 'rotate(45deg) scale(1.1)' : 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = showAI ? 'rotate(45deg)' : 'none'}
      >
        {showAI ? '✕' : '✨'}
      </button>

      {/* Tooltip */}
      {!showAI && (
        <div style={{
          position: 'fixed', bottom: 86, right: 18, zIndex: 299,
          background: '#1B2F43', color: '#fff', borderRadius: 8,
          padding: '5px 10px', fontSize: 11, fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          AI Asistent ✨
        </div>
      )}

      {/* AI ASISTENT PANEL */}
      {showUputstvo && <Uputstvo onClose={() => setShowUputstvo(false)} />}

      {showAI && (
        <AIAsistent
          // KLJUČNO: key vezan za ID aktivnog projekta — ako korisnik promijeni projekat dok je
          // panel otvoren, React potpuno uništi staru komponentu (sa cijelom istorijom razgovora)
          // i napravi svježu. Bez ovoga bi historija poruka iz prethodnog projekta ostala u
          // kontekstu razgovora, iako svaka nova poruka i dalje šalje ispravan spisak stavki
          // iz trenutnog projekta (upisi u bazu su već bili sigurni i prije ove izmjene).
          key={aktivniProjekat?.id || 'bez-projekta'}
          aktivnaFaza={aktivnaFaza}
          pozicije={pozicije}
          onDodajStavku={dodajStavkuIzAI}
          onProcijeniCijene={procijeniCijene}
          onProcijeniCijeneViseFaza={procijeniCijeneViseFaza}
          onDohvatiSvePozicije={dohvatiSvePozicijeProjekta}
          imaProjekat={!!aktivniProjekat}
          brojFaza={faze.length}
          onPrimijeniIzmjene={primijeniIzmjene}
          onSetValuta={postaviValutuNakonAI}
          zahtjevZaUslove={zahtjevZaUslove}
          onZahtjevUslovaObradjen={() => setZahtjevZaUslove(null)}
          onPrimijeniUslove={primijeniAIUslove}
          onClose={() => setShowAI(false)}
          session={session}
        />
      )}

    </div>
  )
}
