import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

export default function MojaBaza({ onClose, onDodaj, jedinice = [], kategorije = [], sifre = null }) {
  // Šifra po logici centralne baze: [broj grupe].90.[redni broj] — npr. "03.90.001".
  // Podgrupa "90" označava prilagođenu (korisnikovu) poziciju, a redni broj prati redoslijed
  // unutar grupe, pa se šifre same preračunavaju kad se stavke premještaju.
  const sifraZa = (kategorija, indeks) => {
    const broj = sifre && sifre.get ? sifre.get(kategorija || '') : null
    if (!broj) return null
    return `${broj}.90.${String(indeks + 1).padStart(3, '0')}`
  }
  const VALUTE = ['EUR', 'KM', 'RSD', 'USD']
  const [stavke, setStavke] = useState([])
  const [loading, setLoading] = useState(true)
  const [forma, setForma] = useState(false)
  const [editId, setEditId] = useState(null)
  const [nova, setNova] = useState({ naziv: '', jedinica: 'kom.', cijena: '', valuta: 'EUR', kategorija: 'Moje stavke' })
  const [grupaFilter, setGrupaFilter] = useState('') // izabrana grupa ('' = sve moje grupe)
  const [tekst, setTekst] = useState('') // tekstualna pretraga po nazivu

  useEffect(() => { ucitaj() }, [])

  const ucitaj = async () => {
    setLoading(true)
    const { data } = await supabase.from('moja_baza').select('*').order('kategorija').order('redoslijed').order('kreiran_at')
    setStavke(data || [])
    setLoading(false)
  }

  const sacuvaj = async () => {
    if (!nova.naziv.trim()) return
    if (editId) {
      await supabase.from('moja_baza').update({
        naziv: nova.naziv, jedinica: nova.jedinica,
        cijena: parseFloat(nova.cijena) || 0, valuta: nova.valuta || 'EUR', kategorija: nova.kategorija
      }).eq('id', editId)
    } else {
      // Nova stavka ide na kraj svoje grupe (dobija sljedeći redni broj u toj kategoriji).
      const kat = nova.kategorija || 'Moje stavke'
      const uGrupi = stavke.filter(s => (s.kategorija || 'Moje stavke') === kat)
      const sljedeci = uGrupi.length ? Math.max(...uGrupi.map(s => s.redoslijed ?? 0)) + 1 : 0
      await supabase.from('moja_baza').insert({
        naziv: nova.naziv, jedinica: nova.jedinica,
        cijena: parseFloat(nova.cijena) || 0, valuta: nova.valuta || 'EUR', kategorija: kat,
        redoslijed: sljedeci, sifra: sifraZa(kat, sljedeci)
      })
    }
    setForma(false); setEditId(null)
    setNova({ naziv: '', jedinica: 'kom.', cijena: '', valuta: 'EUR', kategorija: 'Moje stavke' })
    ucitaj()
  }

  // Premještanje stavke gore/dolje UNUTAR njene grupe radova; numeracija prati novi redoslijed.
  const pomjeri = async (stavka, smjer) => {
    const kat = stavka.kategorija || 'Moje stavke'
    const uGrupi = stavke
      .filter(s => (s.kategorija || 'Moje stavke') === kat)
      .sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0))
    const i = uGrupi.findIndex(s => s.id === stavka.id)
    const j = i + smjer
    if (i === -1 || j < 0 || j >= uGrupi.length) return
    const preuredjene = [...uGrupi]
    ;[preuredjene[i], preuredjene[j]] = [preuredjene[j], preuredjene[i]]
    // Optimistično osvježi prikaz, pa upiši novi redoslijed i preračunatu šifru u bazu.
    // Ručno upisana šifra (koja ne prati [grupa].90.xxx obrazac) se NE dira.
    const noviRed = new Map(preuredjene.map((s, idx) => [s.id, idx]))
    const autoObrazac = /^\S+\.90\.\d{3}$/
    setStavke(prev => prev.map(s => {
      if (!noviRed.has(s.id)) return s
      const idx = noviRed.get(s.id)
      const auto = !s.sifra || autoObrazac.test(s.sifra)
      return { ...s, redoslijed: idx, sifra: auto ? sifraZa(kat, idx) : s.sifra }
    }))
    for (const [id, r] of noviRed) {
      const stara = uGrupi.find(s => s.id === id)
      const auto = !stara?.sifra || autoObrazac.test(stara.sifra)
      const izmjena = auto ? { redoslijed: r, sifra: sifraZa(kat, r) } : { redoslijed: r }
      const { error } = await supabase.from('moja_baza').update(izmjena).eq('id', id)
      if (error) { console.error('Greška pri čuvanju redoslijeda:', error); break }
    }
    ucitaj()
  }

  const obrisi = async (id) => {
    if (!confirm('Obrisati stavku iz vaše baze?')) return
    await supabase.from('moja_baza').delete().eq('id', id)
    ucitaj()
  }

  const uredi = (s) => {
    setEditId(s.id)
    setNova({ naziv: s.naziv, jedinica: s.jedinica, cijena: s.cijena?.toString() || '', valuta: s.valuta || 'EUR', kategorija: s.kategorija })
    setForma(true)
  }

  // Grupe koje STVARNO postoje u bazi (bez cijelog šifarnika, bez opcije „sve"). Poredane po
  // redoslijedu iz šifarnika (prop `kategorije`), nepoznate/„Moje stavke" na kraj.
  const mojeGrupe = [...new Set(stavke.map(s => s.kategorija || 'Moje stavke'))]
    .sort((a, b) => {
      const ia = kategorije.indexOf(a), ib = kategorije.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    })
  useEffect(() => { if (grupaFilter && !mojeGrupe.includes(grupaFilter)) setGrupaFilter('') }, [stavke])

  // Dok je forma otvorena, lista dolje prati kategoriju izabranu U FORMI (prikazuje postojeće
  // stavke te grupe radi reference/izbjegavanja duplikata); ako grupa nema stavki — prazno, bez
  // stavki iz drugih grupa. Dok je forma zatvorena, lista prati gornji filter „Sve moje grupe".
  const grupaZaListu = forma ? (nova.kategorija || 'Moje stavke') : grupaFilter
  const filtrirane = stavke.filter(s =>
    (!grupaZaListu || (s.kategorija || 'Moje stavke') === grupaZaListu) &&
    s.naziv.toLowerCase().includes(tekst.trim().toLowerCase())
  )

  const inp = (val, set, ph, type='text') => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0', marginBottom: 8 }} />
  )
  const selStil = { width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0', marginBottom: 8, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 920, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E5DC', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>⭐ Moja baza stavki</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Vaše personalne stavke — dostupne u svim projektima</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {/* Forma za dodavanje */}
        {forma ? (
          <div style={{ padding: '16px 20px', background: '#F8FAF8', borderBottom: '1px solid #E8E5DC' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
              {editId ? 'Uredi stavku' : 'Nova stavka'}
            </div>
            {inp(nova.naziv, v => setNova(p => ({...p, naziv: v})), 'Naziv pozicije...')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Jedinica mjere</div>
                <select value={nova.jedinica} onChange={e => setNova(p => ({...p, jedinica: e.target.value}))} style={selStil}>
                  {(jedinice.includes(nova.jedinica) ? jedinice : [nova.jedinica, ...jedinice]).map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Cijena</div>
                {inp(nova.cijena, v => setNova(p => ({...p, cijena: v})), '0.00', 'number')}
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Valuta</div>
                <select value={nova.valuta} onChange={e => setNova(p => ({...p, valuta: e.target.value}))} style={selStil}>
                  {VALUTE.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Kategorija (grupa radova)</div>
            <select value={nova.kategorija} onChange={e => setNova(p => ({...p, kategorija: e.target.value}))} style={selStil}>
              <option value="Moje stavke">— Moje stavke (opšte) —</option>
              {!kategorije.includes(nova.kategorija) && nova.kategorija !== 'Moje stavke' && <option value={nova.kategorija}>{nova.kategorija}</option>}
              {kategorije.map(k => <option key={k} value={k}>{sifre && sifre.get && sifre.get(k) ? sifre.get(k) + ' · ' : ''}{k}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={sacuvaj}
                style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {editId ? '💾 Sačuvaj izmjenu' : '+ Dodaj u moju bazu'}
              </button>
              <button onClick={() => { setForma(false); setEditId(null); setNova({ naziv: '', jedinica: 'kom.', cijena: '', valuta: 'EUR', kategorija: 'Moje stavke' }) }}
                style={{ background: 'transparent', color: '#666', border: '1px solid #D8D5CC', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Odustani
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E5DC', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" value={tekst} onChange={e => setTekst(e.target.value)}
              placeholder="🔍 Pretražite vaše stavke..."
              style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0' }} />
            {mojeGrupe.length > 0 && (
              <select value={grupaFilter} onChange={e => setGrupaFilter(e.target.value)}
                title="Filtriraj po grupi iz vaše baze"
                style={{ border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px', fontSize: 12, fontFamily: 'inherit', minWidth: 150, maxWidth: 210, background: '#F5F4F0', cursor: 'pointer' }}>
                <option value="">— Sve moje grupe —</option>
                {mojeGrupe.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <button onClick={() => setForma(true)}
              style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              + Nova stavka
            </button>
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Učitavanje...</div>
          ) : filtrirane.length === 0 ? (
            stavke.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Vaša baza je prazna</div>
                <div style={{ fontSize: 13 }}>Dodajte stavke koje često koristite u projektima</div>
              </div>
            ) : (
              <div style={{ padding: 28, textAlign: 'center', color: '#999', fontSize: 13 }}>
                Nema stavki u ovoj grupi radova.
              </div>
            )
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F5F4F0' }}>
                  <th style={{ padding: '8px 8px 8px 14px', textAlign: 'center', width: 34, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>R.br.</th>
                  <th style={{ padding: '8px 8px', textAlign: 'left', width: 84, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Šifra</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Naziv</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>J.mj.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Cijena</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Kategorija</th>
                  <th style={{ width: 130 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrirane.map(s => {
                  // Redni broj UNUTAR grupe radova (prati redoslijed, mijenja se pri pomjeranju).
                  const uGrupi = stavke
                    .filter(x => (x.kategorija || 'Moje stavke') === (s.kategorija || 'Moje stavke'))
                    .sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0))
                  const rb = uGrupi.findIndex(x => x.id === s.id) + 1
                  const prvi = rb === 1, zadnji = rb === uGrupi.length
                  return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #EEECEA' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAF8'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '9px 8px 9px 14px', textAlign: 'center', color: '#8A94A0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rb}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <input key={`sif-${s.id}-${s.sifra || ''}`} defaultValue={s.sifra || ''} placeholder="šifra"
                        onBlur={async e => {
                          const v = e.target.value.trim()
                          if (v === (s.sifra || '')) return
                          await supabase.from('moja_baza').update({ sifra: v || null }).eq('id', s.id)
                          ucitaj()
                        }}
                        title="Šifra se dodjeljuje automatski po grupi radova; možete je izmijeniti ili obrisati"
                        style={{ width: 76, border: '1px solid transparent', borderRadius: 4, padding: '3px 5px', fontSize: 11.5, fontFamily: 'inherit', background: 'transparent', color: '#8A94A0', fontStyle: 'italic' }}
                        onFocus={e => { e.target.style.border = '1px solid #4A637C'; e.target.style.background = '#F8FAF8'; e.target.style.fontStyle = 'normal' }}
                        onMouseEnter={e => { if (document.activeElement !== e.target) e.target.style.border = '1px solid #E0DDD5' }}
                        onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.border = '1px solid transparent' }} />
                    </td>
                    <td style={{ padding: '9px 16px', lineHeight: 1.4 }}>{s.naziv}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#888' }}>{s.jedinica}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>
                      {s.cijena > 0 ? `${s.cijena.toFixed(2)} ${s.valuta || 'EUR'}` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#888', fontSize: 12 }}>{s.kategorija}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginRight: 2 }}>
                          <button onClick={() => pomjeri(s, -1)} disabled={prvi} title="Pomjeri gore"
                            style={{ background: 'none', border: 'none', cursor: prvi ? 'default' : 'pointer', fontSize: 9, lineHeight: 1, padding: '1px 3px', color: prvi ? '#DDD' : '#556575' }}>▲</button>
                          <button onClick={() => pomjeri(s, 1)} disabled={zadnji} title="Pomjeri dolje"
                            style={{ background: 'none', border: 'none', cursor: zadnji ? 'default' : 'pointer', fontSize: 9, lineHeight: 1, padding: '1px 3px', color: zadnji ? '#DDD' : '#556575' }}>▼</button>
                        </div>
                        {onDodaj && (
                          <button onClick={() => onDodaj(s)} title="Dodaj u predmjer"
                            style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                            + Dodaj
                          </button>
                        )}
                        <button onClick={() => uredi(s)} title="Uredi"
                          style={{ background: 'none', border: '1px solid #D8D5CC', borderRadius: 4, padding: '4px 6px', fontSize: 13, cursor: 'pointer' }}>
                          ✏️
                        </button>
                        <button onClick={() => obrisi(s.id)} title="Obriši"
                          style={{ background: 'none', border: '1px solid #D8D5CC', borderRadius: 4, padding: '4px 6px', fontSize: 13, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fdf0ef'; e.currentTarget.style.borderColor = '#C0392B' }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = '#D8D5CC' }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid #E8E5DC', fontSize: 12, color: '#888', textAlign: 'center' }}>
          {stavke.length} stavki u vašoj bazi · Vidljive samo vama
        </div>
      </div>
    </div>
  )
}
