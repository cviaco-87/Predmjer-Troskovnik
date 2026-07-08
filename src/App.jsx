import React, { useState, useMemo, useCallback, useEffect } from "react"
import AIAsistent from "./AIAsistent.jsx"
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import MojaBaza from './MojaBaza.jsx'
import { BAZA_B64 } from "./baza.js"

// atob() sam tretira svaki bajt kao Latin-1 karakter, što lomi UTF-8 slova (č,ć,š,ž,đ).
// TextDecoder ispravno sastavlja višebajtne UTF-8 sekvence nazad u prava slova.
const BAZA = JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob(BAZA_B64), c => c.charCodeAt(0))))

// Redoslijed kategorija prema šifarniku baze (01, 02, 03...) i podjela na dvije faze izvođenja:
// grubi (konstruktivni) građevinski radovi i završni (zanatski/instalaterski) radovi,
// u skladu sa uobičajenim redoslijedom izvođenja na gradilištu.
const REDOSLIJED_KATEGORIJA = [
  // ── PRIPREMNI RADOVI I RUŠENJE (prethode grubim radovima — priprema gradilišta,
  // uklanjanje postojećih konstrukcija/instalacija prije nove gradnje ili sanacije) ──
  { sifra: '01', naziv: 'Pripremno-završni radovi',  grupa: 'pripremni' },
  { sifra: '20', naziv: 'Demontaže i rušenja',       grupa: 'pripremni' },
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

// Kategorije iz baze poredane po šifarniku; kategorija koje slučajno nema u REDOSLIJED_KATEGORIJA
// (npr. nova dodana kategorija koju smo zaboravili upisati ovdje) ide na kraj, abecedno, da se ne izgubi.
const KATEGORIJE = [...new Set(BAZA.map(b => b.k))].sort((a, b) => {
  const ia = REDOSLIJED_MAP.has(a) ? REDOSLIJED_MAP.get(a) : 999
  const ib = REDOSLIJED_MAP.has(b) ? REDOSLIJED_MAP.get(b) : 999
  if (ia !== ib) return ia - ib
  return a.localeCompare(b)
})

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

const fmt = n => (n || 0).toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtJmj = j => (j || '').replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³').replace(/m1\b/g, 'm¹').replace(/M2\b/g, 'M²').replace(/M3\b/g, 'M³')

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
function BazaPanel({ onAdd, onAddFromMojaBaza, mojeBazaStavke, aktivnaStruka, strukaNaziv }) {
  const [q, setQ] = useState('')
  const [kat, setKat] = useState('')
  const [tab, setTab] = useState('glavna') // glavna | moja

  // Prilagođene (korisnički dodane) faze nemaju unaprijed poznato mapiranje kategorija baze,
  // pa im NE ograničavamo pretragu — vide cijelu bazu i sami biraju šta je relevantno.
  const jePoznataStruka = ['gradjevinski','hidro','elektro','masinski','vanjsko'].includes(aktivnaStruka)

  // Kategorije i broj stavki relevantni za trenutno aktivnu strukу (ili sve, ako je prilagođena faza)
  const kategorijeZaStruku = useMemo(() => jePoznataStruka ? KATEGORIJE.filter(k => strukaZaKategoriju(k) === aktivnaStruka) : KATEGORIJE, [aktivnaStruka, jePoznataStruka])
  const brojUStruci = useMemo(() => jePoznataStruka ? BAZA.reduce((n, item) => n + (strukaZaKategoriju(item.k) === aktivnaStruka ? 1 : 0), 0) : BAZA.length, [aktivnaStruka, jePoznataStruka])

  // Reset kategorije filtera ako više ne pripada aktivnoj struci (npr. korisnik promijeni fazu)
  useEffect(() => { if (kat && !kategorijeZaStruku.includes(kat)) setKat('') }, [aktivnaStruka])

  const rezultati = useMemo(() => {
    const imaTekst = q.trim().length >= 2
    const imaKategoriju = !!kat
    if (!imaTekst && !imaKategoriju) return []
    const terms = imaTekst ? q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1) : []
    if (tab === 'moja') {
      if (!imaTekst) return []
      return mojeBazaStavke
        .filter(s => {
          const n = s.naziv.toLowerCase()
          return terms.every(t => n.includes(t))
        })
        .slice(0, 60)
        .map(s => ({ n: s.naziv, c: s.cijena, m: s.jedinica, k: s.kategorija, _moja: true, _id: s.id }))
    }
    const out = []
    const limit = imaTekst ? 80 : 200
    for (let i = 0; i < BAZA.length && out.length < limit; i++) {
      const item = BAZA[i]
      if (jePoznataStruka && strukaZaKategoriju(item.k) !== aktivnaStruka) continue
      if (kat && item.k !== kat) continue
      const n = item.n.toLowerCase()
      const s = (item.s || '').toLowerCase()
      if (terms.length === 0 || terms.every(t => n.includes(t) || s.includes(t))) out.push({ ...item, _idx: i })
    }
    return out
  }, [q, kat, tab, mojeBazaStavke, aktivnaStruka])

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
      {/* Tabovi */}
      <div style={{ display: 'flex', borderBottom: '1px solid #D2DCE6', background: '#E4E9EE' }}>
        {[['glavna', `📚 Baza (${brojUStruci.toLocaleString('bs-BA')})`], ['moja', `⭐ Moja baza (${mojeBazaStavke.length})`]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', fontSize: 12, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1B2F43' : '#666', borderBottom: tab === t ? '2px solid #1B2F43' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #D2DCE6', background: '#E4E9EE' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder={tab === 'glavna' ? '🔍 Pretražite bazu... (iskop, beton, malter...)' : '🔍 Pretražite vaše stavke...'}
          disabled={tab === 'glavna' && brojUStruci === 0}
          style={{ flex: 1, border: '1px solid #C2CDD8', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: (tab === 'glavna' && brojUStruci === 0) ? '#DCE0E3' : '#fff' }} />
        {tab === 'glavna' && brojUStruci > 0 && (
          <select value={kat} onChange={e => setKat(e.target.value)}
            style={{ border: '1px solid #C2CDD8', borderRadius: 6, padding: '7px', fontSize: 12, fontFamily: 'inherit', minWidth: 150 }}>
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
        {q && <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>×</button>}
      </div>

      {/* Rezultati */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {tab === 'glavna' && brojUStruci === 0 ? (
          <div style={{ padding: '18px 16px', textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 4 }}>Baza za "{strukaNaziv}" još nije dostupna</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>Za sada dodajte pozicije preko <strong>"+ Vlastita stavka"</strong> ili AI asistenta ✨. Baza za ovu fazu će biti dodana naknadno.</div>
          </div>
        ) : (q.trim().length < 2 && !kat) ? (
          <div style={{ padding: '8px 14px', fontSize: 12, color: '#aaa' }}>
            {tab === 'glavna' ? 'Unesite pojam za pretragu (npr: "iskop", "beton", "malter"...) ili izaberite kategoriju da vidite sve stavke' : 'Unesite pojam za pretragu vaših stavki'}
          </div>
        ) : rezultati.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: '#888', fontSize: 13 }}>{q.trim() ? `Nema rezultata za "${q}"` : 'Nema stavki u ovoj kategoriji'}</div>
        ) : (
          <>
            <div style={{ padding: '4px 14px', fontSize: 11, color: '#666', background: '#f0f0ee', borderBottom: '1px solid #E0DDD5' }}>
              {rezultati.length} rezultata — kliknite na poziciju da je dodate
            </div>
            {Object.entries(grouped).map(([k, items]) => (
              <div key={k}>
                <div style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6860', background: '#F5F4F0', position: 'sticky', top: 0 }}>{k}</div>
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
                    <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>/{item.m}</span>
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

  // Kursevi — koliko 1 EUR vrijedi u toj valuti. KM je fiksno vezan za EUR (1,95583), nikad se ne mijenja.
  // RSD i USD su približni tržišni kursevi (ažurirano jul 2026.) — dovoljno tačno za potrebe predmjera.
  const KURSEVI = { EUR: 1, KM: 1.95583, RSD: 117.34, USD: 1.1437 }
  const konvertujCijenu = (iznos, izValute, uValutu) => {
    if (izValute === uValutu) return iznos
    const uEUR = iznos / (KURSEVI[izValute] || 1)
    return uEUR * (KURSEVI[uValutu] || 1)
  }
  const [editPoz, setEditPoz] = useState(null)
  const [kloniranjeLoading, setKloniranjeLoading] = useState(false)
  const [editNazivProjId, setEditNazivProjId] = useState(null) // ID projekta čiji naziv se edituje
  const [firma, setFirma] = useState(null) // { naziv, logo } - postavke firme (logo/naziv) vezane za nalog
  const [showFirmaModal, setShowFirmaModal] = useState(false)
  const [firmaLoading, setFirmaLoading] = useState(false)
  const [aktivnaStruka, setAktivnaStruka] = useState('gradjevinski')
  const [editStrukaKod, setEditStrukaKod] = useState(null) // kod struke koja se trenutno preimenuje
  const [dodajStrukuMod, setDodajStrukuMod] = useState(false) // da li je otvoreno polje za unos nove struke

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
      const pocetnaStruka = struke[0]?.kod || 'gradjevinski'
      setAktivnaStruka(pocetnaStruka)
      ucitajFaze(aktivniProjekat.id, pocetnaStruka)
      setPozicije([])
      // Vrati stvarnu valutu OVOG projekta (u kojoj su cijene stvarno upisane), ne uvijek EUR
      setValuta(aktivniProjekat.valuta || 'EUR')
    }
  }, [aktivniProjekat?.id])

  // Učitaj pozicije kad se promijeni faza
  useEffect(() => {
    if (aktivnaFaza) ucitajPozicije(aktivnaFaza.id)
    else setPozicije([])
  }, [aktivnaFaza])

  const ucitajProjekte = async () => {
    const { data } = await supabase.from('projekti').select('*').order('azuriran_at', { ascending: false })
    setProjekti(data || [])
    if (data?.length > 0 && !aktivniProjekat) {
      setAktivniProjekat(data[0])
    }
  }

  const ucitajFaze = async (projektId, pocetnaStruka) => {
    const { data } = await supabase.from('faze').select('*').eq('projekat_id', projektId).order('redoslijed')
    const uceitaneFaze = data || []
    setFaze(uceitaneFaze)
    // Automatski izaberi PRVU grupu radova unutar aktivne faze/struke — bez ovoga bi
    // korisnik pri svakom ulasku u aplikaciju (ili promjeni faze) morao ručno birati
    // grupu radova prije nego se pozicije uopšte prikažu na desnoj strani.
    if (pocetnaStruka) {
      const prvaUFazi = uceitaneFaze.find(f => (f.struka_kod || 'gradjevinski') === pocetnaStruka)
      setAktivnaFaza(prvaUFazi || null)
    }
  }

  const ucitajPozicije = async (fazaId) => {
    const { data } = await supabase.from('pozicije').select('*').eq('faza_id', fazaId).order('redoslijed')
    setPozicije(data || [])
  }

  const dodajPodstavku = async (roditeljPoz) => {
    if (!aktivnaFaza) return
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id,
      parent_id: roditeljPoz.id,
      naziv: '',
      jedinica: roditeljPoz.jedinica || 'm²',
      cijena: roditeljPoz.cijena || 0,
      kolicina: 0,
      kategorija: roditeljPoz.kategorija || 'Ostalo',
      redoslijed: pozicije.filter(p => p.parent_id === roditeljPoz.id).length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }

  const ucitajMojuBazu = async () => {
    const { data } = await supabase.from('moja_baza').select('*').order('kreiran_at', { ascending: false })
    setMojaBaza(data || [])
  }

  // ── POSTAVKE FIRME (logo/naziv za PDF zaglavlje) ──
  const ucitajFirmu = async () => {
    const { data } = await supabase.from('firma_postavke').select('*').eq('user_id', session.user.id).maybeSingle()
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
      const { data } = await supabase.from('firma_postavke').upsert(payload, { onConflict: 'user_id' }).select().single()
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
    const { data } = await supabase.from('projekti').insert({ naziv: noviProjekat.trim() }).select().single()
    if (data) {
      setNoviProjekat('')
      await ucitajProjekte()
      setAktivniProjekat(data)
    }
  }

  const azurirajProjekat = async (polje, vrijednost) => {
    if (!aktivniProjekat) return
    await supabase.from('projekti').update({ [polje]: vrijednost }).eq('id', aktivniProjekat.id)
    setAktivniProjekat(prev => ({ ...prev, [polje]: vrijednost }))
    setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, [polje]: vrijednost } : p))
  }

  const obrisiProjekat = async (id) => {
    if (!confirm('Obrisati projekat i sve faze i pozicije?')) return
    await supabase.from('projekti').delete().eq('id', id)
    setProjekti(prev => prev.filter(p => p.id !== id))
    if (aktivniProjekat?.id === id) { setAktivniProjekat(null); setFaze([]); setPozicije([]) }
  }

  // ── FAZE ──
  const dodajFazu = async () => {
    if (!novaFaza.trim() || !aktivniProjekat) return
    const { data } = await supabase.from('faze').insert({
      projekat_id: aktivniProjekat.id, naziv: novaFaza.trim(), redoslijed: faze.length, struka_kod: aktivnaStruka
    }).select().single()
    if (data) { setNovaFaza(''); setFaze(prev => [...prev, data]); setAktivnaFaza(data) }
  }

  const obrisiFeazu = async (id) => {
    if (!confirm('Obrisati grupu radova i sve pozicije?')) return
    await supabase.from('faze').delete().eq('id', id)
    setFaze(prev => prev.filter(f => f.id !== id))
    if (aktivnaFaza?.id === id) { setAktivnaFaza(null); setPozicije([]) }
  }

  // ── STRUKE (grupisanje faza po disciplini) ──
  const struke = aktivniProjekat?.struke || DEFAULT_STRUKE

  const azurirajStruke = async (noveStruke) => {
    if (!aktivniProjekat) return
    await supabase.from('projekti').update({ struke: noveStruke }).eq('id', aktivniProjekat.id)
    setAktivniProjekat(prev => ({ ...prev, struke: noveStruke }))
    setProjekti(prev => prev.map(p => p.id === aktivniProjekat.id ? { ...p, struke: noveStruke } : p))
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
    if (!aktivnaFaza) return
    const item = BAZA[idx]
    const roditelji = pozicije.filter(p => !p.parent_id)
    const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
    // Baza je uvijek u EUR — konvertuj u trenutno izabranu valutu prije upisa
    const cijenaUValuti = valuta === 'EUR' ? item.c : Math.round(konvertujCijenu(item.c, 'EUR', valuta) * 100) / 100
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: item.n, jedinica: item.m,
      cijena: cijenaUValuti, kategorija: item.k, redoslijed: red, sifra: item.s || null
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }, [aktivnaFaza, pozicije, valuta])

  const dodajIzMojeBaze = useCallback(async (item) => {
    if (!aktivnaFaza) return
    const roditelji = pozicije.filter(p => !p.parent_id)
    const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: item.n, jedinica: item.m,
      cijena: item.c, kategorija: item.k || 'Moje stavke', redoslijed: red
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }, [aktivnaFaza, pozicije])

  const dodajVlastitupoziciju = async () => {
    if (!aktivnaFaza) return
    const roditelji = pozicije.filter(p => !p.parent_id)
    const zadnjaKat = roditelji.length > 0
      ? roditelji[roditelji.length - 1].kategorija
      : 'Ostalo'
    const red = roditelji.length === 0 ? 0 : Math.max(...roditelji.map(p => p.redoslijed ?? 0)) + 1
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: '', jedinica: 'm²',
      cijena: 0, kategorija: zadnjaKat, redoslijed: red
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }

  // ── DRAG & DROP REDOSLIJED ──
  const dragPoz = React.useRef(null)
  const dragOverPoz = React.useRef(null)

  const onDragStart = (e, poz) => {
    dragPoz.current = poz
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.5'
  }

  const onDragEnd = (e) => {
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
      await supabase.from('pozicije').update({ redoslijed: u.redoslijed }).eq('id', u.id)
    }

    dragPoz.current = null
    dragOverPoz.current = null
  }

  const azurirajPoziciju = async (id, polje, vrijednost) => {
    await supabase.from('pozicije').update({ [polje]: vrijednost }).eq('id', id)
    setPozicije(prev => prev.map(p => p.id === id ? { ...p, [polje]: vrijednost } : p))
  }

  const obrisiPoziciju = async (id) => {
    await supabase.from('pozicije').delete().eq('id', id)
    setPozicije(prev => prev.filter(p => p.id !== id))
  }

  const sacuvajUMojuBazu = async (poz) => {
    await supabase.from('moja_baza').insert({
      naziv: poz.naziv, jedinica: poz.jedinica, cijena: poz.cijena, kategorija: poz.kategorija
    })
    ucitajMojuBazu()
    alert('Stavka sačuvana u vašu bazu!')
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
      alert('Greška pri konverziji cijena — valuta NIJE promijenjena da se izbjegne pogrešno stanje: ' + e.message)
    }
    setLoading(false)
    setValuta(novaValuta)
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

    // Snimi u bazu
    for (const s of stavkeNoveCijene) {
      await supabase.from('pozicije').update({ cijena: s.cijena }).eq('id', s.id)
    }

    // Ponovo učitaj iz baze radi sigurnosti (potvrda konzistentnosti)
    if (aktivnaFaza) await ucitajPozicije(aktivnaFaza.id)

    // Forsiraj osvježenje prikaza cijena u tabeli
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
    for (const s of stavkeIzmjene) {
      await supabase.from('pozicije').update({ naziv: s.noviOpis }).eq('id', s.id)
    }

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
      for (const f of faze) {
        const { data } = await supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed')
        svePozicije[f.id] = data || []
      }

      const response = await fetch('/api/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    for (const f of faze) {
      const { data } = await supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed')
      svePozicije[f.id] = data || []
    }

    const proj = aktivniProjekat
    const fmtN = n => (n||0).toLocaleString('bs-BA', {minimumFractionDigits:2, maximumFractionDigits:2})

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
              <td class="c">${rb++}</td>
              <td class="c" style="font-size:8.5pt;color:#555">${sifra||'—'}</td>
              <td class="opis">${naziv}</td>
              <td class="c">${(p.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
              <td class="r">${!imadjece&&(p.cijena||0)>0?fmtN(p.cijena):(imadjece?'<em style="font-size:8pt;color:#888">zbir</em>':'—')}</td>
              <td class="r">${!imadjece&&(p.kolicina||0)>0?p.kolicina:'—'}</td>
              <td class="r bold">${u>0?fmtN(u)+' '+valutaZnak:'—'}</td>
            </tr>`
            if (imadjece) {
              p.djeca.forEach((d, di) => {
                const du = calcRowSimple(d)
                const dNaziv = (d.naziv||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                rows += `<tr class="pod">
                  <td class="c" style="color:#aaa;font-size:8pt">${rb-1}.${di+1}</td>
                  <td></td>
                  <td class="pod-opis">${dNaziv}</td>
                  <td class="c" style="font-size:8.5pt">${(d.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
                  <td class="r" style="font-size:8.5pt">${(d.cijena||0)>0?fmtN(d.cijena):'—'}</td>
                  <td class="r" style="font-size:8.5pt">${(d.kolicina||0)>0?d.kolicina:'—'}</td>
                  <td class="r" style="color:#4A637C;font-weight:600;font-size:8.5pt">${du>0?fmtN(du)+' '+valutaZnak:'—'}</td>
                </tr>`
              })
              const ukKol = p.djeca.reduce((s,d) => s+(parseFloat(d.kolicina)||0), 0)
              rows += `<tr class="pod-sum">
                <td></td>
                <td></td>
                <td colspan="4" style="font-style:italic;font-size:8pt;color:#666">Ukupno: ${ukKol.toFixed(2)} ${(p.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
                <td class="r" style="font-weight:bold;color:#1B2F43;font-size:9pt">${fmtN(u)} ${valutaZnak}</td>
              </tr>`
            }
          }
        }
        const ft = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
        strukaUkupno += ft
        grupaSubtotali.push({ naziv: f.naziv, ukupno: ft })
        rows += `<tr class="total"><td colspan="6" style="text-align:right">UKUPNO GRUPA:</td><td class="r bold">${fmtN(ft)} ${valutaZnak}</td></tr>`

        if (prikaziDetalj) {
          sviFazeSadrzaj += `
            <div class="faza-header"><h2>${f.naziv.toUpperCase()}</h2></div>
            <table>
              <thead><tr>
                <th class="c" style="width:30px">R.br.</th>
                <th class="c" style="width:60px">Šifra</th>
                <th>Opis pozicije</th>
                <th class="c" style="width:45px">J.mj.</th>
                <th class="r" style="width:75px">Jed. cijena (${valutaZnak})</th>
                <th class="r" style="width:65px">Količina</th>
                <th class="r" style="width:80px">Ukupno (${valutaZnak})</th>
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
<head><meta charset="UTF-8"><title>Predmjer — ${proj.naziv||''}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
  body { font-family:Arial,sans-serif; font-size:10pt; color:#111; }
  .header { margin-bottom:16px; border-bottom:2px solid #1B2F43; padding-bottom:10px; }
  .header h1 { font-size:15pt; color:#1B2F43; margin-bottom:6px; }
  .info { display:grid; grid-template-columns:1fr 1fr; gap:3px 20px; font-size:9pt; margin-top:8px; }
  .info span { color:#555; }
  .struka-blok { page-break-after:avoid; }
  .struka-naslov { background:#1B2F43 !important; color:#fff !important; font-size:13pt; font-weight:700; padding:9px 12px; margin:18px 0 10px; letter-spacing:.03em; }
  .struka-blok:first-child .struka-naslov { margin-top:4px; }
  .struka-total { background:#E8ECF0 !important; color:#1B2F43 !important; font-size:11pt; font-weight:700; padding:8px 12px; margin:6px 0 10px; border-top:2px solid #1B2F43; border-bottom:2px solid #1B2F43; display:flex; justify-content:space-between; }
  .struka-korekcija { margin:0 0 22px; }
  .struka-korekcija td { font-size:9.5pt; padding:4px 12px; border-bottom:none; }
  .faza-header h2 { font-size:11pt; color:#1B2F43; margin:14px 0 5px; padding-bottom:3px; border-bottom:1px solid #4A637C; }
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
  .opis { line-height:1.4; } .bold { font-weight:700; }
  .page-break { page-break-before:always; margin-top:16px; }
  @page {
    margin: 14mm 12mm 18mm 12mm;
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
  }
</style></head>
<body>
<div class="header">
  ${firma?.logo ? `<div style="text-align:left;margin-bottom:6px;"><img src="${firma.logo}" style="height:52px;max-width:150px;object-fit:contain;" /></div>` : ''}
  <h1 style="text-align:center;">PREDMJER I PREDRAČUN</h1>
  ${filtrirajStruku ? `<div style="text-align:center;font-size:10pt;color:#4A637C;margin-top:-4px;margin-bottom:6px;">— ${struke.find(s=>s.kod===filtrirajStruku)?.naziv || ''} —</div>` : ''}
  <div class="info">
    <div><span>Projekat: </span><strong>${proj.naziv||'—'}</strong></div>
    <div style="text-align:right;"><span>Investitor: </span><strong>${proj.klijent||'—'}</strong></div>
    <div><span>Datum: </span>${proj.datum||'—'}</div>
    <div style="text-align:right;"><span>Lokacija: </span>${proj.adresa||'—'}</div>
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

    const rod = pozicije.filter(p => !p.parent_id)
    const red = rod.length === 0 ? 0 : Math.max(...rod.map(p => p.redoslijed ?? 0)) + 1

    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id,
      naziv: cleanNaziv,
      jedinica: stavka.jedinica || 'm²',
      cijena: parseFloat(stavka.cijena) || 0,
      kategorija: aktivnaKategorija,
      redoslijed: red
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }


  // ── KLONIRANJE PROJEKTA ──
  const klonirajProjekat = async () => {
    if (!aktivniProjekat) return
    if (!confirm(`Klonirati projekat "${aktivniProjekat.naziv}"? Bit će kreiran novi projekat sa svim fazama i pozicijama.`)) return
    
    setKloniranjeLoading(true)
    try {
      // Kreiraj novi projekat
      const { data: noviProj } = await supabase.from('projekti').insert({
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

      if (!noviProj) throw new Error('Greška pri kreiranju projekta')

      // Ucitaj sve faze originalnog projekta
      const { data: originalFaze } = await supabase.from('faze').select('*').eq('projekat_id', aktivniProjekat.id).order('redoslijed')
      
      // Za svaku fazu kreiraj kopiju
      for (const f of (originalFaze || [])) {
        const { data: novaFaza } = await supabase.from('faze').insert({
          projekat_id: noviProj.id,
          naziv: f.naziv,
          redoslijed: f.redoslijed,
          struka_kod: f.struka_kod
        }).select().single()

        if (!novaFaza) continue

        // Ucitaj pozicije ove faze i kopiraj ih sa parent_id vezama
        const { data: originalPoz } = await supabase.from('pozicije').select('*').eq('faza_id', f.id).order('redoslijed')
        
        if (originalPoz && originalPoz.length > 0) {
          // Prvo ubaci roditelje (bez parent_id)
          const roditelji = originalPoz.filter(p => !p.parent_id)
          const idMapa = {} // stari_id -> novi_id

          for (const p of roditelji) {
            const { data: novaPoz } = await supabase.from('pozicije').insert({
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
          }

          // Zatim ubaci podstavke sa mapiranim parent_id
          const djeca = originalPoz.filter(p => p.parent_id)
          for (const d of djeca) {
            const noviParentId = idMapa[d.parent_id]
            if (!noviParentId) continue
            await supabase.from('pozicije').insert({
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
          }
        }
      }

      // Ucitaj projekte i odaberi novi
      await ucitajProjekte()
      setAktivniProjekat(noviProj)
      setEditNazivProjId(noviProj.id) // Odmah omogući promjenu naziva
      // Napomena: postavljanje aktivniProjekat gore automatski pokreće useEffect na
      // aktivniProjekat?.id, koji učitava faze i bira prvu grupu radova nove (klonirane)
      // strukе — ista logika kao pri običnom ulasku u aplikaciju, bez potrebe za duplim kodom.
    } catch(e) {
      alert('Greška pri kloniranju: ' + e.message)
    }
    setKloniranjeLoading(false)
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#1B2F43', background: '#CDD1D6', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>📁</span>Projekti</div>
          <div style={{ padding: '12px 12px 14px' }}>
          {projekti.map(p => (
            <div key={p.id} onClick={() => setAktivniProjekat(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                background: p.id === aktivniProjekat?.id ? '#E8ECF0' : 'transparent',
                border: p.id === aktivniProjekat?.id ? '1px solid #4A637C' : '1px solid transparent' }}
              onMouseEnter={e => { if (p.id !== aktivniProjekat?.id) e.currentTarget.style.background = '#F0F2F5' }}
              onMouseLeave={e => { if (p.id !== aktivniProjekat?.id) e.currentTarget.style.background = '' }}>
              {editNazivProjId === p.id ? (
                <input
                  type="text"
                  defaultValue={p.naziv}
                  autoFocus
                  onBlur={async e => {
                    const noviNaziv = e.target.value.trim() || p.naziv
                    await azurirajProjekat('naziv', noviNaziv)
                    setEditNazivProjId(null)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.target.blur()
                    if (e.key === 'Escape') setEditNazivProjId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, border: '1px solid #4A637C', borderRadius: 4, padding: '2px 6px', fontSize: 13, fontFamily: 'inherit', fontWeight: 500, background: '#fff' }}
                />
              ) : (
                <span
                  style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  onDoubleClick={e => { e.stopPropagation(); setAktivniProjekat(p); setEditNazivProjId(p.id) }}
                  title="Dvoklick za promjenu naziva"
                >{p.naziv}</span>
              )}
              <button onClick={async e => { 
                  e.stopPropagation()
                  setAktivniProjekat(p)
                  await klonirajProjekat()
                }}
                title="Kloniraj projekat (⧉)"
                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#1B2F43'}
                onMouseLeave={e => e.currentTarget.style.color = '#ccc'}>⧉</button>
              <button onClick={e => { e.stopPropagation(); obrisiProjekat(p.id) }}
                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#C0392B'}
                onMouseLeave={e => e.currentTarget.style.color = '#ccc'}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 14 }}>
            <input type="text" value={noviProjekat} onChange={e => setNoviProjekat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dodajProjekat()}
              placeholder="Novi projekat..."
              style={{ flex: 1, minWidth: 0, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
            <button onClick={dodajProjekat} style={B('#1B2F43')}>+ Dodaj</button>
          </div>
          </div>
          </div>

          {/* Podaci o projektu */}
          {aktivniProjekat && <>
            <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #4A637C', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#3D5468', background: '#D7DDE2', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>📋</span>Podaci o projektu</div>
            <div style={{ padding: '12px 12px 14px' }}>
            {[['naziv', 'Naziv projekta'], ['klijent', 'Investitor'], ['adresa', 'Lokacija']].map(([k, lbl]) => (
              <div key={k} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{lbl}</div>
                <input type="text" defaultValue={aktivniProjekat[k] || ''} onBlur={e => azurirajProjekat(k, e.target.value)}
                  style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Datum</div>
              <input type="date" defaultValue={aktivniProjekat.datum || ''} onBlur={e => azurirajProjekat('datum', e.target.value)}
                style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
            </div>
            </div>
            </div>
          </>}

          {/* Struke (discipline) */}
          {aktivniProjekat && <>
            <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #6B8299', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#425A70', background: '#DEE4E9', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>🏗️</span>Faza</div>
            <div style={{ padding: '12px 12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
              {struke.map(s => (
                <div key={s.kod} onClick={() => {
                    // Ako je već aktivna ova ista struka, ne diraj ništa (izbjegava nepotreban re-fetch pozicija)
                    if (s.kod === aktivnaStruka) return
                    setAktivnaStruka(s.kod)
                    // Automatski izaberi PRVU grupu radova nove faze/struke (ili ništa ako je nema),
                    // bez obzira na to je li prethodno nešto bilo izabrano — inače bi klik na strukу
                    // nakon strukе bez grupa radova (aktivnaFaza je null) ostao bez efekta.
                    const prvaUFazi = faze.find(f => (f.struka_kod || 'gradjevinski') === s.kod)
                    setAktivnaFaza(prvaUFazi || null)
                    if (!prvaUFazi) setPozicije([])
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                    background: s.kod === aktivnaStruka ? '#1B2F43' : 'transparent',
                    border: s.kod === aktivnaStruka ? '1px solid #1B2F43' : '1px solid #E8E5DC' }}
                  onMouseEnter={e => { if (s.kod !== aktivnaStruka) e.currentTarget.style.background = '#F0F2F5' }}
                  onMouseLeave={e => { if (s.kod !== aktivnaStruka) e.currentTarget.style.background = '' }}>
                  {editStrukaKod === s.kod ? (
                    <input type="text" defaultValue={s.naziv} autoFocus
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
                <input type="text" autoFocus placeholder="Naziv nove faze..."
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#4C5E6E', background: '#E5E9ED', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>📦</span>Grupe radova</div>
            <div style={{ padding: '12px 12px 14px' }}>
            {(() => {
              const fazeUFazi = faze.filter(f => (f.struka_kod || 'gradjevinski') === aktivnaStruka)
              const aktivnaPripada = aktivnaFaza && fazeUFazi.some(f => f.id === aktivnaFaza.id)
              return fazeUFazi.length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={aktivnaPripada ? aktivnaFaza.id : ''}
                      onChange={e => setAktivnaFaza(fazeUFazi.find(f => f.id === e.target.value) || null)}
                      style={{ flex: 1, minWidth: 0, border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 8px', fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                      <option value="" disabled>— Odaberite grupu radova —</option>
                      {fazeUFazi.map(f => <option key={f.id} value={f.id}>{f.naziv}</option>)}
                    </select>
                    {aktivnaPripada && (
                      <button onClick={() => obrisiFeazu(aktivnaFaza.id)} title="Obriši ovu grupu radova"
                        style={{ background: '#FBE4E1', border: '1px solid #E8A5A0', borderRadius: 6, color: '#C0392B', cursor: 'pointer', fontSize: 16, padding: '6px 10px', fontFamily: 'inherit', flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FBE4E1'; e.currentTarget.style.color = '#C0392B' }}>🗑</button>
                    )}
                  </div>
                  {aktivnaPripada && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 2px 0', fontSize: 12 }}>
                      <span style={{ color: '#888' }}>{aktivnaFaza.naziv}</span>
                      <span style={{ fontWeight: 700, color: '#1B2F43', fontVariantNumeric: 'tabular-nums' }}>{fmt(fazaTotali[aktivnaFaza.id] || 0)} {valutaZnak}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Još nema grupa radova u ovoj fazi.</div>
              )
            })()}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 16 }}>
              <input type="text" value={novaFaza} onChange={e => setNovaFaza(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && dodajFazu()}
                placeholder="Naziv grupe radova..."
                style={{ flex: 1, minWidth: 0, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
              <button onClick={dodajFazu} style={B('#1B2F43')}>+ Dodaj</button>
            </div>
            </div>
            </div>
          </>}

          {/* Uvećanje / Umanjenje — podešava se po fazi, ne globalno za cijeli projekat */}
          <div style={{ background: '#fff', border: '1px solid #E5E2D8', borderLeft: '4px solid #C9954E', borderRadius: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8A6524', background: '#F4ECDD', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>⚖️</span>Uvećanje / Umanjenje</div>
          <div style={{ padding: '12px 12px 14px' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
            za fazu: <strong style={{ color: '#4A637C' }}>{struke.find(s => s.kod === aktivnaStruka)?.naziv || aktivnaStruka}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 12, color: '#666' }}>Uvećanje (%)</span>
            <input type="number" key={`uvec-${aktivnaStruka}`} defaultValue={struke.find(s => s.kod === aktivnaStruka)?.uvecanjePct || 0} min="0" step="0.5"
              onBlur={e => { const v = parseFloat(e.target.value) || 0; postaviUvecanjeStruke(aktivnaStruka, v) }}
              style={{ width: 55, border: '1px solid #D8D5CC', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }} />
          </div>
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 10 }}>npr. PDV, opšti troškovi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 12, color: '#C0392B' }}>Umanjenje (%)</span>
            <input type="number" key={`uman-${aktivnaStruka}`} defaultValue={struke.find(s => s.kod === aktivnaStruka)?.umanjenjePct || 0} min="0" max="100" step="0.5"
              onBlur={e => { const v = parseFloat(e.target.value) || 0; postaviUmanjenjeStruke(aktivnaStruka, v) }}
              style={{ width: 55, border: '1px solid #f5c6c2', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right', color: '#C0392B' }} />
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>npr. popust, sopstvena režija</div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #E8E5DC' }}>
            <button onClick={() => setShowMojaBaza(true)}
              style={{ width: '100%', background: '#F0F2F5', color: '#1B2F43', border: '1px solid #4A637C', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⭐ Upravljaj mojom bazom ({mojeBaza.length})
            </button>
          </div>
          </div>
          </div>

          {/* Rekapitulacija */}
          <div style={{ background: '#EEF0F3', border: '1px solid #C9D3DE', borderRadius: 10, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#1B2F43', background: '#DDE0E3', padding: '9px 12px' }}><span style={{ fontSize: 15 }}>📊</span>Rekapitulacija</div>
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
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#aaa' }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <p style={{ fontSize: 15 }}>Dodajte ili odaberite projekat</p>
            </div>
          ) : !aktivnaFaza ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#aaa' }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <p style={{ fontSize: 15 }}>Dodajte ili odaberite grupu radova</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div style={{ background: '#1B2F43', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.15)', margin: '12px 12px 10px 12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{aktivnaFaza.naziv}</span>
                <div style={{ flex: 1 }}></div>
                <button onClick={dodajVlastitupoziciju} style={B('transparent', '#fff', '1px solid rgba(255,255,255,.5)')}>+ Vlastita stavka</button>
                {/* Valutni meni */}
                <select value={valuta} onChange={e => promijeniValutu(e.target.value)}
                  style={{ border: '1px solid rgba(255,255,255,.4)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
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
              </div>

              {/* Baza pretraga */}
              <div style={{ margin: '0 12px 10px 12px', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.1)', overflow: 'hidden', flexShrink: 0 }}>
              <BazaPanel
                onAdd={dodajPoziciju}
                onAddFromMojaBaza={dodajIzMojeBaze}
                mojeBazaStavke={mojeBaza}
                aktivnaStruka={aktivnaStruka}
                strukaNaziv={struke.find(s => s.kod === aktivnaStruka)?.naziv || ''}
              />
              </div>

              {/* Tabela */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px 12px' }}>
                {pozicije.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', color: '#888' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 6 }}>Faza je prazna</div>
                    <div style={{ fontSize: 12 }}>Pretražite bazu iznad i kliknite na poziciju da je dodate.</div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1B2F43', color: '#fff' }}>
                        {['R.br.', 'Šifra', 'Opis pozicije', 'J.mj.', `Jed. cijena (${valutaZnak})`, 'Količina', `Ukupno (${valutaZnak})`, ''].map((h, i) => (
                          <th key={i} style={{ padding: '9px 8px', textAlign: i >= 4 && i <= 6 ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(grouped).map(([kat, poz]) => (
                        <React.Fragment key={kat}>
                          <tr key={'k' + kat} style={{ background: '#D2DCE6' }}>
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
                            return (
                              <React.Fragment key={p.id}>
                                {/* GLAVNA STAVKA */}
                                <tr
                                  draggable
                                  onDragStart={e => onDragStart(e, p)}
                                  onDragEnd={onDragEnd}
                                  onDragOver={e => onDragOver(e, p)}
                                  onDrop={e => onDrop(e, p)}
                                  style={{ borderBottom: imadjece ? 'none' : '2px solid #E4E1D8', background: paleta.glavna, cursor: 'grab' }}
                                  onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                                  onMouseLeave={e => e.currentTarget.style.background = paleta.glavna}>
                                  <td style={{ padding: '6px 8px', color: '#1A1A18', fontWeight: 700, fontSize: 13, width: 28, verticalAlign: 'top', borderRadius: imadjece ? '6px 0 0 0' : '6px 0 0 6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A18' }}>{i + 1}</span>
                                      <span className="drag-rucka" style={{ color: '#ccc', fontSize: 12, lineHeight: 1, userSelect: 'none', cursor: 'grab' }} title="Prevuci da promijeniš redoslijed">⠿</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', verticalAlign: 'top', width: 82, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    <input
                                      type="text"
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
                                      ref={el => { if (el) el._pozId = p.id }}
                                      defaultValue={p.naziv || ''}
                                      onBlur={e => {
                                        azurirajPoziciju(p.id, 'naziv', e.target.value)
                                        // Sačuvaj i trenutnu visinu (hvata i ručno povlačenje ivice, ne samo dupli klik)
                                        const trenutnaVisina = e.target.offsetHeight
                                        if (trenutnaVisina && trenutnaVisina !== p.opis_visina) {
                                          azurirajPoziciju(p.id, 'opis_visina', trenutnaVisina)
                                        }
                                        e.target.style.border = '1px solid transparent'
                                        e.target.style.background = 'transparent'
                                      }}
                                      rows={Math.max(2, Math.ceil((p.naziv||'').length / 65))}
                                      onClick={e => e.stopPropagation()}
                                      onDoubleClick={e => {
                                        e.preventDefault()
                                        const t = e.currentTarget
                                        const originalRows = t.rows
                                        // KLJUČNO: 'auto' visina i dalje poštuje 'rows' atribut kao minimum,
                                        // pa moramo privremeno spustiti rows na 1 da bi scrollHeight izmjerio
                                        // STVARNU potrebnu visinu za sadržaj, ne procijenjenu/rezervisanu
                                        t.rows = 1
                                        t.style.height = 'auto'
                                        // Malu rezervu (6px) dodajemo na izmjerenu visinu — scrollHeight je
                                        // ponekad par piksela kraći od stvarno potrebnog prostora zbog
                                        // zaokruživanja line-height/padding vrijednosti, što bi inače
                                        // ostavilo tekst da "jedva ne stane" i izazvalo nepotreban unutrašnji
                                        // scrollbar sa strane ćelije.
                                        const potrebno = Math.max(t.scrollHeight + 6, 40)
                                        t.rows = originalRows
                                        t.style.height = potrebno + 'px'
                                        // Odmah sačuvaj u bazu da ostane trajno podešeno
                                        azurirajPoziciju(p.id, 'opis_visina', potrebno)
                                      }}
                                      title="Dvoklik za automatsko prilagođavanje visine ćelije tekstu"
                                      style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minHeight: 40, height: p.opis_visina ? `${p.opis_visina}px` : undefined, color: '#2B2B26' }}
                                      onFocus={e => { e.target.style.border = '1px solid #4A637C'; e.target.style.background = '#F8FAF8' }}
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
                                          // Azuriraj bazu (ali ne state da ne re-renderuje)
                                          azurirajPoziciju(p.id, 'naziv', novi)
                                        }
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                    {!imadjece && <select
                                      defaultValue={fmtJmj(p.jedinica)||'m²'}
                                      onChange={e => azurirajPoziciju(p.id, 'jedinica', e.target.value)}
                                      style={{ width: 58, border: '1px solid transparent', borderRadius: 4, padding: '2px 2px', fontSize: 11, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' }}
                                      onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                      onBlur={e => e.target.style.border = '1px solid transparent'}>
                                      {['m²','m³','m¹','m1','kom.','pau.','kg','t','l','h','dan'].map(j => (
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
                                    {!imadjece && <input type="number" defaultValue={p.kolicina || ''} onBlur={e => azurirajPoziciju(p.id, 'kolicina', parseFloat(e.target.value) || 0)}
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
                                      <td style={{ padding: '4px 8px', color: '#333', fontWeight: 600, textAlign: 'right', fontSize: 12 }}>{i+1}.{di+1}</td>
                                      <td></td>
                                      <td style={{ padding: '4px 8px 4px 24px', verticalAlign: 'top', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          
                                          <textarea
                                            value={d.naziv || ''}
                                            onChange={e => {
                                              // Azuriraj lokalni state odmah
                                              setPozicije(prev => prev.map(pz => pz.id === d.id ? {...pz, naziv: e.target.value} : pz))
                                            }}
                                            onBlur={e => {
                                              // Snimi u bazu i azuriraj stil
                                              azurirajPoziciju(d.id, 'naziv', e.target.value)
                                              e.target.style.border = '1px solid transparent'
                                              e.target.style.background = 'transparent'
                                            }}
                                            rows={1}
                                            placeholder="Npr: Prizemlje, Sprat 1, Zona A..."
                                            style={{ flex: 1, border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: 'transparent', resize: 'none', lineHeight: 1.4, color: '#444' }}
                                            onFocus={e => { e.target.style.border = '1px solid #4A637C'; e.target.style.background = '#F0F2F5' }}
                                          />
                                         </div>
                                       </td>
                                      <td style={{ padding: '4px 8px', color: '#888', textAlign: 'center', fontSize: 11, borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <select
                                          defaultValue={fmtJmj(d.jedinica)||'m²'}
                                          onChange={e => azurirajPoziciju(d.id, 'jedinica', e.target.value)}
                                          style={{ width: 52, border: '1px solid transparent', borderRadius: 4, padding: '2px 2px', fontSize: 10, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer' }}
                                          onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                          onBlur={e => e.target.style.border = '1px solid transparent'}>
                                          {['m²','m³','m¹','m1','kom.','pau.','kg','t','l','h','dan'].map(j => (
                                            <option key={j} value={j}>{j}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <input key={`cij-${d.id}-${revizija}`} type="number" defaultValue={d.cijena || ''} onBlur={e => azurirajPoziciju(d.id, 'cijena', parseFloat(e.target.value) || 0)}
                                          style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        <input type="number" defaultValue={d.kolicina || ''} onBlur={e => azurirajPoziciju(d.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                          placeholder="0" min="0" step="any"
                                          style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#4A637C', fontSize: 11, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
                                        {du > 0 ? fmt(du) + ' ' + valutaZnak : '—'}
                                      </td>
                                      <td style={{ padding: '4px 4px', borderLeft: '1px solid rgba(27,47,67,0.18)' }}>
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
            </>
          )}
        </div>
      </div>

      {/* Moja baza modal */}
      {showMojaBaza && (
        <MojaBaza
          onClose={() => { setShowMojaBaza(false); ucitajMojuBazu() }}
          onDodaj={item => { dodajIzMojeBaze({ n: item.naziv, c: item.cijena, m: item.jedinica, k: item.kategorija }); setShowMojaBaza(false) }}
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
      {showAI && (
        <AIAsistent
          aktivnaFaza={aktivnaFaza}
          pozicije={pozicije}
          onDodajStavku={dodajStavkuIzAI}
          onProcijeniCijene={procijeniCijene}
          onPrimijeniIzmjene={primijeniIzmjene}
          onSetValuta={postaviValutuNakonAI}
          onClose={() => setShowAI(false)}
        />
      )}

    </div>
  )
}

// ── EXPORT FUNKCIJE - dodati na kraj fajla prije zadnje zagrade
