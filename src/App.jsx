import React, { useState, useMemo, useCallback, useEffect } from "react"
import AIAsistent from "./AIAsistent.jsx"
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import MojaBaza from './MojaBaza.jsx'
import { BAZA_B64 } from "./baza.js"

const BAZA = JSON.parse(atob(BAZA_B64))
const KATEGORIJE = [...new Set(BAZA.map(b => b.k))].sort()

const fmt = n => (n || 0).toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtJmj = j => (j || '').replace(/m2/g, 'm²').replace(/m3/g, 'm³').replace(/m1/g, 'm¹').replace(/M2/g, 'M²').replace(/M3/g, 'M³')
const calcRow = (p, svePoz) => {
  // Ako stavka ima podstavke, ukupno je zbir podstavki
  if (svePoz) {
    const djeca = svePoz.filter(d => d.parent_id === p.id)
    if (djeca.length > 0) return djeca.reduce((s, d) => s + calcRowSimple(d), 0)
  }
  return calcRowSimple(p)
}
const calcRowSimple = p => (parseFloat(p.kolicina) || 0) * (parseFloat(p.cijena) || 0) * (1 - (parseFloat(p.rabat) || 0) / 100)
const calcFaza = f => (f.pozicije || []).reduce((s, p) => s + calcRow(p, pozicije), 0)

// ── SEARCH PANEL ──────────────────────────────────
function BazaPanel({ onAdd, onAddFromMojaBaza, mojeBazaStavke }) {
  const [q, setQ] = useState('')
  const [kat, setKat] = useState('')
  const [tab, setTab] = useState('glavna') // glavna | moja

  const rezultati = useMemo(() => {
    if (q.trim().length < 2) return []
    const terms = q.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1)
    if (tab === 'moja') {
      return mojeBazaStavke
        .filter(s => {
          const n = s.naziv.toLowerCase()
          return terms.every(t => n.includes(t))
        })
        .slice(0, 60)
        .map(s => ({ n: s.naziv, c: s.cijena, m: s.jedinica, k: s.kategorija, _moja: true, _id: s.id }))
    }
    const out = []
    for (let i = 0; i < BAZA.length && out.length < 80; i++) {
      const item = BAZA[i]
      if (kat && item.k !== kat) continue
      const n = item.n.toLowerCase()
      if (terms.every(t => n.includes(t))) out.push({ ...item, _idx: i })
    }
    return out
  }, [q, kat, tab, mojeBazaStavke])

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
    <div style={{ display: 'flex', flexDirection: 'column', background: '#FAFAF8', borderBottom: '2px solid #D8D5CC', maxHeight: 280, flexShrink: 0 }}>
      {/* Tabovi */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E0DDD5', background: '#fff' }}>
        {[['glavna', '📚 Glavna baza (4.595)'], ['moja', `⭐ Moja baza (${mojeBazaStavke.length})`]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', border: 'none', background: 'none', fontSize: 12, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#1B4332' : '#888', borderBottom: tab === t ? '2px solid #1B4332' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #E0DDD5', background: '#fff' }}>
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder={tab === 'glavna' ? '🔍 Pretražite bazu... (iskop, beton, malter...)' : '🔍 Pretražite vaše stavke...'}
          style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }} />
        {tab === 'glavna' && (
          <select value={kat} onChange={e => setKat(e.target.value)}
            style={{ border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px', fontSize: 12, fontFamily: 'inherit', minWidth: 150 }}>
            <option value="">— Sve kategorije —</option>
            {KATEGORIJE.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {q && <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>}
      </div>

      {/* Rezultati */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {q.trim().length < 2 ? (
          <div style={{ padding: '8px 14px', fontSize: 12, color: '#aaa' }}>
            {tab === 'glavna' ? 'Unesite pojam za pretragu (npr: "iskop", "beton", "malter"...)' : 'Unesite pojam za pretragu vaših stavki'}
          </div>
        ) : rezultati.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: '#888', fontSize: 13 }}>Nema rezultata za "{q}"</div>
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
                    onMouseEnter={e => e.currentTarget.style.background = '#E8F0EC'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{item.n}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4332', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
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
  const [valuta, setValuta] = useState('EUR') // EUR | KM | RSD | USD

  const VALUTE = [
    { kod: 'EUR', znak: '€', naziv: 'Euro' },
    { kod: 'KM',  znak: 'KM', naziv: 'Kon. marka' },
    { kod: 'RSD', znak: 'din', naziv: 'Dinar' },
    { kod: 'USD', znak: '$', naziv: 'Dolar' },
  ]
  const valutaZnak = VALUTE.find(v => v.kod === valuta)?.znak || '€'
  const [uvR, setUvR] = useState(0)
  const [uvM, setUvM] = useState(0)
  const [umR, setUmR] = useState(0)
  const [umM, setUmM] = useState(0)
  const [editPoz, setEditPoz] = useState(null)
  const [kloniranjeLoading, setKloniranjeLoading] = useState(false)
  const [editNazivProjId, setEditNazivProjId] = useState(null) // ID projekta čiji naziv se edituje

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

  // Učitaj projekte i moju bazu kad se korisnik prijavi
  useEffect(() => {
    if (session) {
      ucitajProjekte()
      ucitajMojuBazu()
    }
  }, [session])

  // Učitaj faze kad se promijeni projekat
  useEffect(() => {
    if (aktivniProjekat) {
      ucitajFaze(aktivniProjekat.id)
      setAktivnaFaza(null)
      setPozicije([])
      setUvR(aktivniProjekat.uv_radovi || 0)
      setUvM(aktivniProjekat.uv_materijal || 0)
    }
  }, [aktivniProjekat])

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

  const ucitajFaze = async (projektId) => {
    const { data } = await supabase.from('faze').select('*').eq('projekat_id', projektId).order('redoslijed')
    setFaze(data || [])
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
      rabat: roditeljPoz.rabat || 0,
      kategorija: roditeljPoz.kategorija || 'Ostalo',
      redoslijed: pozicije.filter(p => p.parent_id === roditeljPoz.id).length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }

  const ucitajMojuBazu = async () => {
    const { data } = await supabase.from('moja_baza').select('*').order('kreiran_at', { ascending: false })
    setMojaBaza(data || [])
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
      projekat_id: aktivniProjekat.id, naziv: novaFaza.trim(), redoslijed: faze.length
    }).select().single()
    if (data) { setNovaFaza(''); setFaze(prev => [...prev, data]); setAktivnaFaza(data) }
  }

  const obrisiFeazu = async (id) => {
    if (!confirm('Obrisati fazu i sve pozicije?')) return
    await supabase.from('faze').delete().eq('id', id)
    setFaze(prev => prev.filter(f => f.id !== id))
    if (aktivnaFaza?.id === id) { setAktivnaFaza(null); setPozicije([]) }
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
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: item.n, jedinica: item.m,
      cijena: item.c, kategorija: item.k, redoslijed: red
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }, [aktivnaFaza, pozicije])

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
  const exportExcel = async () => {
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
        body: JSON.stringify({ projekat: aktivniProjekat, faze, svePozicije, uvR, uvM, umR, umM })
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
  const exportPDF = async () => {
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
    const uvec = grandTotal * (uvR + uvM) / 100
    const uman = grandTotal * (umR + umM) / 100
    const ukupno = grandTotal + uvec - uman

    let sviFazeSadrzaj = ''
    for (const f of faze) {
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
          rows += `<tr>
            <td class="c">${rb++}</td>
            <td class="opis">${naziv}</td>
            <td class="c">${(p.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
            <td class="r">${!imadjece&&(p.cijena||0)>0?fmtN(p.cijena):(imadjece?'<em style="font-size:8pt;color:#888">zbir</em>':'—')}</td>
            <td class="r">${!imadjece&&(p.kolicina||0)>0?p.kolicina:'—'}</td>
            <td class="r">${!imadjece&&(p.rabat||0)>0?p.rabat+'%':'—'}</td>
            <td class="r bold">${u>0?fmtN(u)+' €':'—'}</td>
          </tr>`
          if (imadjece) {
            p.djeca.forEach((d, di) => {
              const du = calcRowSimple(d)
              const dNaziv = (d.naziv||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
              rows += `<tr class="pod">
                <td class="c" style="color:#aaa;font-size:8pt">${rb-1}.${di+1}</td>
                <td class="pod-opis">${dNaziv}</td>
                <td class="c" style="font-size:8.5pt">${(d.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
                <td class="r" style="font-size:8.5pt">${(d.cijena||0)>0?fmtN(d.cijena):'—'}</td>
                <td class="r" style="font-size:8.5pt">${(d.kolicina||0)>0?d.kolicina:'—'}</td>
                <td class="r" style="font-size:8.5pt">${(d.rabat||0)>0?d.rabat+'%':'—'}</td>
                <td class="r" style="color:#4A7C65;font-weight:600;font-size:8.5pt">${du>0?fmtN(du)+' €':'—'}</td>
              </tr>`
            })
            const ukKol = p.djeca.reduce((s,d) => s+(parseFloat(d.kolicina)||0), 0)
            rows += `<tr class="pod-sum">
              <td></td>
              <td colspan="5" style="font-style:italic;font-size:8pt;color:#666">Ukupno: ${ukKol.toFixed(2)} ${(p.jedinica||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')}</td>
              <td class="r" style="font-weight:bold;color:#1B4332;font-size:9pt">${fmtN(u)} €</td>
            </tr>`
          }
        }
      }
      const ft = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
      rows += `<tr class="total"><td colspan="6" style="text-align:right">UKUPNO FAZA:</td><td class="r bold">${fmtN(ft)} €</td></tr>`

      sviFazeSadrzaj += `
        <div class="faza-header"><h2>${f.naziv.toUpperCase()}</h2></div>
        <table>
          <thead><tr>
            <th class="c" style="width:30px">R.br.</th><th>Opis pozicije</th>
            <th class="c" style="width:45px">J.mj.</th>
            <th class="r" style="width:75px">Jed. cijena (€)</th>
            <th class="r" style="width:65px">Količina</th>
            <th class="r" style="width:50px">Rabat</th>
            <th class="r" style="width:80px">Ukupno (€)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-bottom:16px"></div>`
    }

    const rekapRows = faze.map(f => {
      const poz = svePozicije[f.id]||[]
      const t = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
      return `<tr><td>${f.naziv}</td><td class="r">${fmtN(t)} €</td></tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="bs">
<head><meta charset="UTF-8"><title>Predmjer — ${proj.naziv||''}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
  body { font-family:Arial,sans-serif; font-size:10pt; color:#111; }
  .header { margin-bottom:16px; border-bottom:2px solid #1B4332; padding-bottom:10px; }
  .header h1 { font-size:15pt; color:#1B4332; margin-bottom:6px; }
  .info { display:grid; grid-template-columns:1fr 1fr; gap:3px 20px; font-size:9pt; margin-top:8px; }
  .info span { color:#555; }
  .faza-header h2 { font-size:11pt; color:#1B4332; margin:14px 0 5px; padding-bottom:3px; border-bottom:1px solid #4A7C65; }
  table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  th { background:#1B4332 !important; color:#fff !important; padding:5px 6px; text-align:left; font-size:8pt; text-transform:uppercase; }
  th.r { text-align:right; } th.c { text-align:center; }
  td { padding:4px 6px; border-bottom:1px solid #E5E5E0; vertical-align:top; font-size:9.5pt; }
  tr:nth-child(even) td { background:#F9F9F7 !important; }
  .kat td { background:#EEF3F1 !important; font-weight:700; font-size:8.5pt; color:#1B4332 !important; text-transform:uppercase; }
  .pod td { background:#FAFAF8 !important; border-bottom:none; }
  .pod-opis { padding-left:16px; font-size:9pt; color:#444; }
  .pod-sum td { background:#F5F8F6 !important; border-top:1px solid #D8D5CC; border-bottom:1px solid #D8D5CC; }
  .total td { background:#EEF3F1 !important; font-weight:700; border-top:2px solid #1B4332; }
  .c { text-align:center; } .r { text-align:right; }
  .opis { line-height:1.4; } .bold { font-weight:700; }
  .page-break { page-break-before:always; margin-top:16px; }
  @page { margin:12mm; }
  @media print {
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    th { background:#1B4332 !important; color:#fff !important; }
    .kat td { background:#EEF3F1 !important; }
    .total td { background:#EEF3F1 !important; }
    .pod-sum td { background:#F5F8F6 !important; }
  }
</style></head>
<body>
<div class="header">
  <h1>PREDMJER I PREDRAČUN</h1>
  <div class="info">
    <div><span>Projekat: </span><strong>${proj.naziv||'—'}</strong></div>
    <div><span>Investitor: </span><strong>${proj.klijent||'—'}</strong></div>
    <div><span>Lokacija: </span>${proj.adresa||'—'}</div>
    <div><span>Datum: </span>${proj.datum||'—'}</div>
  </div>
</div>
${sviFazeSadrzaj}
<div class="page-break"></div>
<h2 style="color:#1B4332;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1B4332">REKAPITULACIJA</h2>
<table style="width:400px">
  <thead><tr><th>Faza</th><th class="r">Ukupno (€)</th></tr></thead>
  <tbody>
    ${rekapRows}
    <tr class="total"><td>Međuzbir</td><td class="r bold">${fmtN(grandTotal)} €</td></tr>
    ${uvec>0?`<tr><td style="color:#1B4332">+ Uvećanje (${uvR+uvM}%)</td><td class="r" style="color:#1B4332">+${fmtN(uvec)} €</td></tr>`:''}
    ${uman>0?`<tr><td style="color:#C0392B">− Umanjenje (${umR+umM}%)</td><td class="r" style="color:#C0392B">−${fmtN(uman)} €</td></tr>`:''}
    <tr class="total"><td><strong>SVEUKUPNO</strong></td><td class="r bold" style="font-size:12pt">${fmtN(ukupno)} €</td></tr>
  </tbody>
</table>
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
        uv_radovi: aktivniProjekat.uv_radovi,
        uv_materijal: aktivniProjekat.uv_materijal
      }).select().single()

      if (!noviProj) throw new Error('Greška pri kreiranju projekta')

      // Ucitaj sve faze originalnog projekta
      const { data: originalFaze } = await supabase.from('faze').select('*').eq('projekat_id', aktivniProjekat.id).order('redoslijed')
      
      // Za svaku fazu kreiraj kopiju
      for (const f of (originalFaze || [])) {
        const { data: novaFaza } = await supabase.from('faze').insert({
          projekat_id: noviProj.id,
          naziv: f.naziv,
          redoslijed: f.redoslijed
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
              rabat: p.rabat,
              kategorija: p.kategorija,
              redoslijed: p.redoslijed,
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
              rabat: d.rabat,
              kategorija: d.kategorija,
              redoslijed: d.redoslijed,
              parent_id: noviParentId
            })
          }
        }
      }

      // Ucitaj projekte i odaberi novi
      await ucitajProjekte()
      setAktivniProjekat(noviProj)
      setEditNazivProjId(noviProj.id) // Odmah omogući promjenu naziva
    } catch(e) {
      alert('Greška pri kloniranju: ' + e.message)
    }
    setKloniranjeLoading(false)
  }

  const odjava = () => supabase.auth.signOut()

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F0' }}>
      <div style={{ fontSize: 14, color: '#888' }}>Učitavanje...</div>
    </div>
  )

  if (!session) return <Auth />

  const B = (bg, color = '#fff', border = 'none') => ({
    padding: '6px 12px', borderRadius: 6, border, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', background: bg, color, whiteSpace: 'nowrap'
  })

  const medjuzbir = Object.values(fazaTotali).reduce((a, b) => a + b, 0)
  const uvecanje = medjuzbir * (uvR + uvM) / 100
  const umanjenje = medjuzbir * (umR + umM) / 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: 13, background: '#F5F4F0', color: '#1A1A18' }}>

      {/* HEADER */}
      <div style={{ background: '#1B4332', color: '#fff', padding: '0 18px', height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>📐 Predmjer / Troškovnik</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '3px 10px' }}>
            {session.user.email}
          </span>
          <button onClick={odjava}
            style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
            Odjava
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT PANEL */}
        <div style={{ width: 280, minWidth: 280, background: '#fff', borderRight: '1px solid #D8D5CC', overflowY: 'auto', padding: 12, flexShrink: 0 }}>

          {/* Projekti */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Projekti</div>
          {projekti.map(p => (
            <div key={p.id} onClick={() => setAktivniProjekat(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                background: p.id === aktivniProjekat?.id ? '#E8F0EC' : 'transparent',
                border: p.id === aktivniProjekat?.id ? '1px solid #4A7C65' : '1px solid transparent' }}
              onMouseEnter={e => { if (p.id !== aktivniProjekat?.id) e.currentTarget.style.background = '#F0F5F2' }}
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
                  style={{ flex: 1, border: '1px solid #4A7C65', borderRadius: 4, padding: '2px 6px', fontSize: 13, fontFamily: 'inherit', fontWeight: 500, background: '#fff' }}
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
                onMouseEnter={e => e.currentTarget.style.color = '#1B4332'}
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
              style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
            <button onClick={dodajProjekat} style={B('#1B4332')}>+ Dodaj</button>
          </div>

          {/* Podaci o projektu */}
          {aktivniProjekat && <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Podaci o projektu</div>
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
          </>}

          {/* Faze */}
          {aktivniProjekat && <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Faze projekta</div>
            {faze.map(f => {
              const t = f.id === aktivnaFaza?.id ? (fazaTotali[f.id] || 0) : 0
              return (
                <div key={f.id} onClick={() => setAktivnaFaza(f)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                    background: f.id === aktivnaFaza?.id ? '#E8F0EC' : 'transparent',
                    border: f.id === aktivnaFaza?.id ? '1px solid #4A7C65' : '1px solid transparent' }}
                  onMouseEnter={e => { if (f.id !== aktivnaFaza?.id) e.currentTarget.style.background = '#F0F5F2' }}
                  onMouseLeave={e => { if (f.id !== aktivnaFaza?.id) e.currentTarget.style.background = '' }}>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{f.naziv}</span>
                  {f.id === aktivnaFaza?.id && <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>{fmt(t)} €</span>}
                  <button onClick={e => { e.stopPropagation(); obrisiFeazu(f.id) }}
                    style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#C0392B'}
                    onMouseLeave={e => e.currentTarget.style.color = '#ccc'}>×</button>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 16 }}>
              <input type="text" value={novaFaza} onChange={e => setNovaFaza(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && dodajFazu()}
                placeholder="Naziv faze..."
                style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
              <button onClick={dodajFazu} style={B('#1B4332')}>+ Dodaj</button>
            </div>
          </>}

          {/* Uvećanje */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Uvećanje / Umanjenje</div>
          {[['Uvećanje radovi', uvR, setUvR, 'uv_radovi'], ['Uvećanje materijal', uvM, setUvM, 'uv_materijal']].map(([lbl, val, setter, db]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ flex: 1, fontSize: 12, color: '#666' }}>{lbl} (%)</span>
              <input type="number" value={val} min="0" step="0.5"
                onChange={e => { const v = parseFloat(e.target.value) || 0; setter(v); azurirajProjekat(db, v) }}
                style={{ width: 55, border: '1px solid #D8D5CC', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }} />
            </div>
          ))}
          <div style={{ borderTop: '1px solid #E8E5DC', marginTop: 8, paddingTop: 8 }}>
          {[['Umanjenje radovi', umR, setUmR, 'um_radovi'], ['Umanjenje materijal', umM, setUmM, 'um_materijal']].map(([lbl, val, setter, db]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ flex: 1, fontSize: 12, color: '#C0392B' }}>{lbl} (%)</span>
              <input type="number" value={val} min="0" max="100" step="0.5"
                onChange={e => { const v = parseFloat(e.target.value) || 0; setter(v); azurirajProjekat(db, v) }}
                style={{ width: 55, border: '1px solid #f5c6c2', borderRadius: 6, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', textAlign: 'right', color: '#C0392B' }} />
            </div>
          ))}
          </div>

          {/* Moja baza dugme */}
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowMojaBaza(true)}
              style={{ width: '100%', background: '#F0F5F2', color: '#1B4332', border: '1px solid #4A7C65', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⭐ Upravljaj mojom bazom ({mojeBaza.length})
            </button>
          </div>

          {/* Rekapitulacija */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#888', margin: '14px 0 8px' }}>Rekapitulacija</div>
          {aktivnaFaza && pozicije.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0', color: '#666' }}>{aktivnaFaza.naziv}</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(fazaTotali[aktivnaFaza.id] || 0)} €
                  </td>
                </tr>
                <tr><td colSpan={2} style={{ borderTop: '1px solid #D8D5CC', paddingTop: 5 }}></td></tr>
                {uvecanje > 0 && <tr><td style={{ color: '#1B4332' }}>+ Uvećanje</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>+{fmt(uvecanje)} €</td></tr>}
                {umanjenje > 0 && <tr><td style={{ color: '#C0392B' }}>− Umanjenje</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>−{fmt(umanjenje)} €</td></tr>}
                <tr>
                  <td style={{ fontWeight: 800, fontSize: 14 }}>UKUPNO</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt((fazaTotali[aktivnaFaza.id] || 0) + uvecanje - umanjenje)} €
                  </td>
                </tr>
              </tbody>
            </table>
          ) : <p style={{ fontSize: 12, color: '#aaa' }}>Odaberite fazu.</p>}
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
              <p style={{ fontSize: 15 }}>Dodajte ili odaberite fazu projekta</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div style={{ background: '#fff', borderBottom: '1px solid #D8D5CC', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{aktivnaFaza.naziv}</span>
                <div style={{ flex: 1 }}></div>
                <button onClick={dodajVlastitupoziciju} style={B('transparent', '#1B4332', '1px solid #4A7C65')}>+ Vlastita stavka</button>
                {/* Valutni meni */}
                <select value={valuta} onChange={e => setValuta(e.target.value)}
                  style={{ border: '1px solid #4A7C65', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', background: '#F0F5F2', color: '#1B4332', fontWeight: 600, cursor: 'pointer' }}>
                  {VALUTE.map(v => <option key={v.kod} value={v.kod}>{v.znak} {v.naziv}</option>)}
                </select>
                <button onClick={exportExcel} style={B('#217346')}>📊 Excel</button>
                <button onClick={exportPDF} style={B('#1B4332')}>🖨 Print/PDF</button>
              </div>

              {/* Baza pretraga */}
              <BazaPanel
                onAdd={dodajPoziciju}
                onAddFromMojaBaza={dodajIzMojeBaze}
                mojeBazaStavke={mojeBaza}
              />

              {/* Tabela */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {pozicije.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', color: '#888' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 6 }}>Faza je prazna</div>
                    <div style={{ fontSize: 12 }}>Pretražite bazu iznad i kliknite na poziciju da je dodate.</div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1B4332', color: '#fff' }}>
                        {['R.br.', 'Opis pozicije', 'J.mj.', 'Jed. cijena (€)', 'Količina', 'Rabat', 'Ukupno (€)', ''].map((h, i) => (
                          <th key={i} style={{ padding: '9px 8px', textAlign: i >= 3 && i <= 6 ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(grouped).map(([kat, poz]) => (
                        <React.Fragment key={kat}>
                          <tr key={'k' + kat} style={{ background: '#EEF3F1' }}>
                            <td colSpan={8} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 11, color: '#1B4332', textTransform: 'uppercase', letterSpacing: '.04em' }}>{kat}</td>
                          </tr>
                          {poz.map((p, i) => {
                            const u = calcRow(p, pozicije)
                            const djeca = podstavke[p.id] || []
                            const imadjece = djeca.length > 0
                            return (
                              <React.Fragment key={p.id}>
                                {/* GLAVNA STAVKA */}
                                <tr
                                  draggable
                                  onDragStart={e => onDragStart(e, p)}
                                  onDragEnd={onDragEnd}
                                  onDragOver={e => onDragOver(e, p)}
                                  onDrop={e => onDrop(e, p)}
                                  style={{ borderBottom: imadjece ? 'none' : '1px solid #EEECEA', background: 'white', cursor: 'grab' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAF8'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                                  <td style={{ padding: '6px 8px', color: '#888', width: 28, verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      <span style={{ color: '#ccc', fontSize: 14, lineHeight: 1, userSelect: 'none', cursor: 'grab' }} title="Prevuci da promijeniš redoslijed">⠿</span>
                                      <span style={{ fontSize: 11, color: '#aaa' }}>{i + 1}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 280 }}>
                                    <textarea
                                      ref={el => { if (el) el._pozId = p.id }}
                                      defaultValue={p.naziv || ''}
                                      onBlur={e => {
                                        azurirajPoziciju(p.id, 'naziv', e.target.value)
                                        e.target.style.border = '1px solid transparent'
                                        e.target.style.background = 'transparent'
                                      }}
                                      rows={Math.max(2, Math.ceil((p.naziv||'').length / 65))}
                                      onClick={e => e.stopPropagation()}
                                      style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit', background: 'transparent', resize: 'vertical', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', minHeight: 40 }}
                                      onFocus={e => { e.target.style.border = '1px solid #4A7C65'; e.target.style.background = '#F8FAF8' }}
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
                                  <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
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
                                  <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                                    {!imadjece && <input key={`cij-${p.id}-${p.cijena}`} type="number" defaultValue={p.cijena || ''} onBlur={e => azurirajPoziciju(p.id, 'cijena', parseFloat(e.target.value) || 0)}
                                      style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />}
                                    {imadjece && <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>zbir podstavki</span>}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                                    {!imadjece && <input type="number" defaultValue={p.kolicina || ''} onBlur={e => azurirajPoziciju(p.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                      placeholder="0" min="0" step="any"
                                      style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                    {!imadjece && <><input type="number" defaultValue={p.rabat || ''} onBlur={e => azurirajPoziciju(p.id, 'rabat', parseFloat(e.target.value) || 0)}
                                      placeholder="0" min="0" max="100"
                                      style={{ width: 42, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} /> %</>}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1B4332', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                                    {u > 0 ? fmt(u) + ' €' : '—'}
                                  </td>
                                  <td style={{ padding: '6px 4px', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                                      <button onClick={() => dodajPodstavku(p)} title="Dodaj podstavku (sprat/zona)"
                                        style={{ background: '#E8F0EC', border: '1px solid #4A7C65', cursor: 'pointer', color: '#1B4332', fontSize: 11, padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        + pod
                                      </button>
                                      <div style={{ display: 'flex', gap: 2 }}>
                                        <button onClick={() => sacuvajUMojuBazu(p)} title="Sačuvaj u moju bazu"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '1px 2px', borderRadius: 3, opacity: 0.6 }}
                                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>⭐</button>
                                        <button onClick={() => obrisiPoziciju(p.id)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: '1px 3px', borderRadius: 3 }}
                                          onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.background = '#fdf0ef' }}
                                          onMouseLeave={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = '' }}>×</button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* PODSTAVKE */}
                                {djeca.map((d, di) => {
                                  const du = calcRowSimple(d)
                                  return (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #F0EDE8', background: '#FAFAF8' }}>
                                      <td style={{ padding: '4px 8px', color: '#aaa', textAlign: 'right', fontSize: 11 }}>{i+1}.{di+1}</td>
                                      <td style={{ padding: '4px 8px 4px 24px', verticalAlign: 'top' }}>
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
                                            onFocus={e => { e.target.style.border = '1px solid #4A7C65'; e.target.style.background = '#F0F5F2' }}
                                          />
                                         </div>
                                       </td>
                                      <td style={{ padding: '4px 8px', color: '#888', textAlign: 'center', fontSize: 11 }}>
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
                                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                        <input key={`cij-${d.id}-${d.cijena}`} type="number" defaultValue={d.cijena || ''} onBlur={e => azurirajPoziciju(d.id, 'cijena', parseFloat(e.target.value) || 0)}
                                          style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                        <input type="number" defaultValue={d.kolicina || ''} onBlur={e => azurirajPoziciju(d.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                          placeholder="0" min="0" step="any"
                                          style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <input type="number" defaultValue={d.rabat || ''} onBlur={e => azurirajPoziciju(d.id, 'rabat', parseFloat(e.target.value) || 0)}
                                          placeholder="0" min="0" max="100"
                                          style={{ width: 38, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '2px 3px', fontSize: 10, fontFamily: 'inherit', background: '#F5F4F0' }} /> %
                                      </td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#4A7C65', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                        {du > 0 ? fmt(du) + ' €' : '—'}
                                      </td>
                                      <td style={{ padding: '4px 4px' }}>
                                        <button onClick={() => obrisiPoziciju(d.id)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, lineHeight: 1, padding: '1px 3px', borderRadius: 3 }}
                                          onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.background = '#fdf0ef' }}
                                          onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.background = '' }}>×</button>
                                      </td>
                                    </tr>
                                  )
                                })}

                                {/* RED SA UKUPNO PODSTAVKI */}
                                {imadjece && (
                                  <tr style={{ borderBottom: '1px solid #EEECEA', background: '#F5F8F6' }}>
                                    <td></td>
                                    <td colSpan={4} style={{ padding: '3px 8px 3px 24px', fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                                      Ukupno: {djeca.reduce((s,d) => s + (parseFloat(d.kolicina)||0), 0).toFixed(2)} {fmtJmj(p.jedinica)}
                                    </td>
                                    <td></td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700, color: '#1B4332', fontSize: 12, borderTop: '1px solid #D8D5CC', fontVariantNumeric: 'tabular-nums' }}>
                                      {fmt(u)} €
                                    </td>
                                    <td></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </React.Fragment>
                      ))}
                      <tr style={{ background: '#EEF3F1' }}>
                        <td colSpan={6} style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1B4332' }}>UKUPNO FAZA:</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>{fmt(fazaTotali[aktivnaFaza.id] || 0)} €</td>
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
      {/* ── AI ASISTENT PLUTAJUĆE DUGME ── */}
      <button
        onClick={() => setShowAI(prev => !prev)}
        title="AI Asistent za predmjer"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 299,
          width: 56, height: 56, borderRadius: '50%',
          background: showAI ? '#14362A' : 'linear-gradient(135deg, #1B4332, #2D6A4F)',
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
          background: '#1B4332', color: '#fff', borderRadius: 8,
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
          onSetValuta={setValuta}
          onClose={() => setShowAI(false)}
        />
      )}

    </div>
  )
}

// ── EXPORT FUNKCIJE - dodati na kraj fajla prije zadnje zagrade
