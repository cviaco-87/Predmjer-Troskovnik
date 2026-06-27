import React, { useState, useMemo, useCallback, useEffect } from "react"
import AIAsistent from "./AIAsistent.jsx"
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import MojaBaza from './MojaBaza.jsx'
import { BAZA_B64 } from "./baza.js"

const BAZA = JSON.parse(atob(BAZA_B64))
const KATEGORIJE = [...new Set(BAZA.map(b => b.k))].sort()

const fmt = n => (n || 0).toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const calcRow = p => (parseFloat(p.kolicina) || 0) * (parseFloat(p.cijena) || 0) * (1 - (parseFloat(p.rabat) || 0) / 100)
const calcFaza = f => (f.pozicije || []).reduce((s, p) => s + calcRow(p), 0)

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
  const [uvR, setUvR] = useState(0)
  const [uvM, setUvM] = useState(0)
  const [umR, setUmR] = useState(0)
  const [umM, setUmM] = useState(0)

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
  const dodajPoziciju = useCallback(async (idx) => {
    if (!aktivnaFaza) return
    const item = BAZA[idx]
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: item.n, jedinica: item.m,
      cijena: item.c, kategorija: item.k, redoslijed: pozicije.length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }, [aktivnaFaza, pozicije.length])

  const dodajIzMojeBaze = useCallback(async (item) => {
    if (!aktivnaFaza) return
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: item.n, jedinica: item.m,
      cijena: item.c, kategorija: item.k || 'Moje stavke', redoslijed: pozicije.length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
  }, [aktivnaFaza, pozicije.length])

  const dodajVlastitupoziciju = async () => {
    if (!aktivnaFaza) return
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id, naziv: 'Nova stavka', jedinica: 'kom',
      cijena: 0, kategorija: 'Ostalo', redoslijed: pozicije.length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
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

  // ── KALKULACIJE ──
  const grandTotal = faze.reduce((s, f) => {
    const fazaPoz = f.id === aktivnaFaza?.id ? pozicije : []
    return s + fazaPoz.reduce((ss, p) => ss + calcRow(p), 0)
  }, 0)

  const grouped = useMemo(() => {
    const g = {}
    for (const p of pozicije) { const k = p.kategorija || 'Ostalo'; if (!g[k]) g[k] = []; g[k].push(p) }
    return g
  }, [pozicije])

  const fazaTotali = useMemo(() => {
    const t = {}
    if (aktivnaFaza) t[aktivnaFaza.id] = pozicije.reduce((s, p) => s + calcRow(p), 0)
    return t
  }, [pozicije, aktivnaFaza])


  // ── EXCEL EXPORT ──
  const exportExcel = async () => {
    if (!aktivnaFaza || pozicije.length === 0) { alert('Nema podataka za export.'); return }
    
    let XLSX
    try {
      const mod = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')
      XLSX = mod.default || mod
    } catch(e) {
      alert('Greška pri učitavanju Excel biblioteke. Provjerite internet vezu.'); return
    }
    
    const proj = aktivniProjekat || {}
    const fmtN = n => (n||0).toFixed(2)
    
    const wb = XLSX.utils.book_new()
    
    // ── SHEET 1: Rekapitulacija ──
    const recapRows = [
      ['PREDMJER I PREDRAČUN', '', '', ''],
      ['', '', '', ''],
      ['Projekat:', proj.naziv || '', 'Investitor:', proj.klijent || ''],
      ['Lokacija:', proj.adresa || '', 'Datum:', proj.datum || ''],
      ['', '', '', ''],
      ['REKAPITULACIJA', '', '', ''],
      ['Faza', 'Ukupno (EUR)', '', ''],
    ]
    
    const fazaTotal = pozicije.reduce((s,p) => s + calcRow(p), 0)
    recapRows.push([aktivnaFaza.naziv, {t:'n', v: fazaTotal, z:'#,##0.00'}])
    
    const uvec = fazaTotal * (uvR + uvM) / 100
    const uman = fazaTotal * (umR + umM) / 100
    const ukupno = fazaTotal + uvec - uman
    
    recapRows.push(['', '', '', ''])
    if (uvec > 0) recapRows.push(['Uvećanje (' + (uvR+uvM) + '%):', {t:'n', v: uvec, z:'#,##0.00'}, '', ''])
    if (uman > 0) recapRows.push(['Umanjenje (' + (umR+umM) + '%):', {t:'n', v: -uman, z:'#,##0.00'}, '', ''])
    recapRows.push(['UKUPNO:', {t:'n', v: ukupno, z:'#,##0.00'}, '', ''])
    
    const wsRecap = XLSX.utils.aoa_to_sheet(recapRows)
    wsRecap['!cols'] = [{wch:35}, {wch:18}, {wch:20}, {wch:18}]
    XLSX.utils.book_append_sheet(wb, wsRecap, 'Rekapitulacija')
    
    // ── SHEET 2: Pozicije (detalj) ──
    const detaljRows = [
      ['PREDMJER I PREDRAČUN — ' + aktivnaFaza.naziv.toUpperCase()],
      [],
      ['Projekat:', proj.naziv || '', '', 'Investitor:', proj.klijent || ''],
      ['Lokacija:', proj.adresa || '', '', 'Datum:', proj.datum || ''],
      [],
      ['R.br.', 'Opis pozicije', 'J.mj.', 'Jed. cijena (EUR)', 'Količina', 'Rabat (%)', 'Ukupno (EUR)']
    ]
    
    // Grupisano po kategorijama
    const byK = {}
    for (const p of pozicije) { const k = p.kategorija||'Ostalo'; if(!byK[k]) byK[k]=[]; byK[k].push(p) }
    
    let rb = 1
    for (const [k, pz] of Object.entries(byK)) {
      detaljRows.push(['', k.toUpperCase(), '', '', '', '', ''])
      for (const p of pz) {
        detaljRows.push([
          rb++,
          p.naziv,
          p.jedinica,
          {t:'n', v: parseFloat(p.cijena)||0, z:'#,##0.00'},
          parseFloat(p.kolicina) || '',
          parseFloat(p.rabat) || '',
          {t:'n', v: calcRow(p), z:'#,##0.00'}
        ])
      }
      detaljRows.push([])
    }
    
    detaljRows.push([])
    detaljRows.push(['', '', '', '', '', 'UKUPNO FAZA:', {t:'n', v: fazaTotal, z:'#,##0.00'}])
    if (uvec > 0) detaljRows.push(['', '', '', '', '', '+ Uvećanje:', {t:'n', v: uvec, z:'#,##0.00'}])
    if (uman > 0) detaljRows.push(['', '', '', '', '', '− Umanjenje:', {t:'n', v: -uman, z:'#,##0.00'}])
    detaljRows.push(['', '', '', '', '', 'SVEUKUPNO:', {t:'n', v: ukupno, z:'#,##0.00'}])
    
    const wsDetalj = XLSX.utils.aoa_to_sheet(detaljRows)
    wsDetalj['!cols'] = [{wch:5}, {wch:70}, {wch:10}, {wch:16}, {wch:12}, {wch:12}, {wch:16}]
    XLSX.utils.book_append_sheet(wb, wsDetalj, aktivnaFaza.naziv.slice(0,31))
    
    // Snimi fajl
    const ime = (proj.naziv || 'Predmjer').replace(/[:\/?*[\]]/g, '_')
    const faza = aktivnaFaza.naziv.replace(/[:\/?*[\]]/g, '_')
    XLSX.writeFile(wb, `${ime}_${faza}_${proj.datum || ''}.xlsx`)
  }

  // ── PDF PRINT ──
  const exportPDF = () => {
    if (!aktivnaFaza || pozicije.length === 0) { alert('Nema podataka za štampu.'); return }
    const proj = aktivniProjekat || {}
    const fmtN = n => (n||0).toLocaleString('bs-BA', {minimumFractionDigits:2,maximumFractionDigits:2})
    
    // Grupisi po kategorijama
    const byK = {}
    for (const p of pozicije) { const k = p.kategorija||'Ostalo'; if(!byK[k]) byK[k]=[]; byK[k].push(p) }
    
    let rows = ''
    let rb = 1
    for (const [k, pz] of Object.entries(byK)) {
      rows += `<tr class="kat"><td colspan="7">${k.toUpperCase()}</td></tr>`
      for (const p of pz) {
        const u = calcRow(p)
        const rabat = parseFloat(p.rabat) || 0
        rows += `<tr>
          <td class="c">${rb++}</td>
          <td class="opis">${p.naziv || ''}</td>
          <td class="c">${p.jedinica || ''}</td>
          <td class="r">${p.cijena > 0 ? fmtN(p.cijena) : '—'}</td>
          <td class="r">${parseFloat(p.kolicina) > 0 ? p.kolicina : '—'}</td>
          <td class="r">${rabat > 0 ? rabat + '%' : '—'}</td>
          <td class="r bold">${u > 0 ? fmtN(u) + ' €' : '—'}</td>
        </tr>`
      }
    }
    
    const fazaTotal = pozicije.reduce((s,p) => s + calcRow(p), 0)
    const uvec = fazaTotal * (uvR + uvM) / 100
    const uman = fazaTotal * (umR + umM) / 100
    const ukupno = fazaTotal + uvec - uman
    
    rows += `<tr class="total">
      <td colspan="6" style="text-align:right;padding:8px">UKUPNO FAZA:</td>
      <td class="r bold">${fmtN(fazaTotal)} €</td>
    </tr>`
    
    if (uvec > 0) rows += `<tr class="sub"><td colspan="6" style="text-align:right;padding:4px 8px">+ Uvećanje:</td><td class="r">${fmtN(uvec)} €</td></tr>`
    if (uman > 0) rows += `<tr class="sub red"><td colspan="6" style="text-align:right;padding:4px 8px">− Umanjenje:</td><td class="r red">${fmtN(uman)} €</td></tr>`
    if (uvec > 0 || uman > 0) rows += `<tr class="total"><td colspan="6" style="text-align:right;padding:8px">SVEUKUPNO:</td><td class="r bold">${fmtN(ukupno)} €</td></tr>`
    
    const html = `<!DOCTYPE html>
<html lang="bs">
<head>
<meta charset="UTF-8">
<title>Predmjer — ${proj.naziv || ''} — ${aktivnaFaza.naziv}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
  .header { margin-bottom: 16px; }
  .header h1 { font-size: 14pt; color: #1B4332; margin-bottom: 6px; }
  .header h2 { font-size: 11pt; color: #1B4332; margin-bottom: 10px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; font-size: 9pt; margin-bottom: 14px; }
  .info span { color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1B4332; color: #fff; padding: 6px 6px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  th.r { text-align: right; }
  td { padding: 5px 6px; border-bottom: 1px solid #E5E5E0; vertical-align: top; font-size: 9.5pt; }
  tr:nth-child(even) td { background: #F9F9F7; }
  tr.kat td { background: #EEF3F1; font-weight: 700; font-size: 8.5pt; color: #1B4332; text-transform: uppercase; letter-spacing: .04em; padding: 5px 6px; }
  tr.total td { background: #EEF3F1; font-weight: 700; border-top: 2px solid #1B4332; }
  tr.sub td { background: #F5F5F3; }
  .c { text-align: center; width: 30px; }
  .r { text-align: right; }
  .opis { line-height: 1.4; }
  .bold { font-weight: 700; color: #1B4332; }
  .red { color: #C0392B; }
  @page { margin: 14mm 12mm; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>PREDMJER I PREDRAČUN</h1>
  <h2>${aktivnaFaza.naziv.toUpperCase()}</h2>
  <div class="info">
    <div><span>Projekat: </span><strong>${proj.naziv||'—'}</strong></div>
    <div><span>Investitor: </span><strong>${proj.klijent||'—'}</strong></div>
    <div><span>Lokacija: </span>${proj.adresa||'—'}</div>
    <div><span>Datum: </span>${proj.datum||'—'}</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th class="c">R.br.</th>
      <th style="min-width:300px">Opis pozicije</th>
      <th style="width:45px;text-align:center">J.mj.</th>
      <th class="r" style="width:75px">Jed. cijena (€)</th>
      <th class="r" style="width:65px">Količina</th>
      <th class="r" style="width:50px">Rabat</th>
      <th class="r" style="width:80px">Ukupno (€)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`
    
    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 800)
  }


  // ── AI ASISTENT - dodaj stavku ──
  const dodajStavkuIzAI = async (stavka) => {
    if (!aktivnaFaza) return
    const { data } = await supabase.from('pozicije').insert({
      faza_id: aktivnaFaza.id,
      naziv: stavka.naziv,
      jedinica: stavka.jedinica,
      cijena: parseFloat(stavka.cijena) || 0,
      kategorija: stavka.kategorija || 'Ostalo',
      redoslijed: pozicije.length
    }).select().single()
    if (data) setPozicije(prev => [...prev, data])
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
              <span style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naziv}</span>
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
                            const u = calcRow(p)
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #EEECEA' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#F8FAF8'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ padding: '6px 8px', color: '#888', width: 28 }}>{i + 1}</td>
                                <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 280 }}>
                                  <textarea defaultValue={p.naziv} onBlur={e => azurirajPoziciju(p.id, 'naziv', e.target.value)}
                                    rows={Math.max(2, Math.ceil(p.naziv.length / 60))}
                                    style={{ width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', fontSize: 12, fontFamily: 'inherit', background: 'transparent', resize: 'none', lineHeight: 1.5, overflow: 'hidden', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                                    onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                    onBlur={e => e.target.style.border = '1px solid transparent'} />
                                </td>
                                <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap' }}>
                                  <input type="text" defaultValue={p.jedinica} onBlur={e => azurirajPoziciju(p.id, 'jedinica', e.target.value)}
                                    style={{ width: 50, border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit', background: 'transparent' }}
                                    onFocus={e => e.target.style.border = '1px solid #D8D5CC'}
                                    onBlurCapture={e => e.target.style.border = '1px solid transparent'} />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                  <input type="number" defaultValue={p.cijena || ''} onBlur={e => azurirajPoziciju(p.id, 'cijena', parseFloat(e.target.value) || 0)}
                                    style={{ width: 75, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                  <input type="number" defaultValue={p.kolicina || ''} onBlur={e => azurirajPoziciju(p.id, 'kolicina', parseFloat(e.target.value) || 0)}
                                    placeholder="0" min="0" step="any"
                                    style={{ width: 68, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit', background: '#F5F4F0' }} />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <input type="number" defaultValue={p.rabat || ''} onBlur={e => azurirajPoziciju(p.id, 'rabat', parseFloat(e.target.value) || 0)}
                                    placeholder="0" min="0" max="100"
                                    style={{ width: 42, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 4, padding: '3px 4px', fontSize: 11, fontFamily: 'inherit', background: '#F5F4F0' }} /> %
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>{u > 0 ? fmt(u) + ' €' : '—'}</td>
                                <td style={{ padding: '6px 4px' }}>
                                  <div style={{ display: 'flex', gap: 2 }}>
                                    <button onClick={() => sacuvajUMojuBazu(p)} title="Sačuvaj u moju bazu"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 3px', borderRadius: 3, opacity: 0.6 }}
                                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                      onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
>⭐</button>
                                    <button onClick={() => obrisiPoziciju(p.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18, lineHeight: 1, padding: '2px 4px', borderRadius: 3 }}
                                      onMouseEnter={e => { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.background = '#fdf0ef' }}
                                      onMouseLeave={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = '' }}>×</button>
                                  </div>
                                </td>
                              </tr>
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
          onDodajStavku={dodajStavkuIzAI}
          onClose={() => setShowAI(false)}
        />
      )}

    </div>
  )
}

// ── EXPORT FUNKCIJE - dodati na kraj fajla prije zadnje zagrade
