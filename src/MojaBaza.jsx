import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

export default function MojaBaza({ onClose, onDodaj, jedinice = [], kategorije = [] }) {
  const VALUTE = ['EUR', 'KM', 'RSD', 'USD']
  const [stavke, setStavke] = useState([])
  const [loading, setLoading] = useState(true)
  const [forma, setForma] = useState(false)
  const [editId, setEditId] = useState(null)
  const [nova, setNova] = useState({ naziv: '', jedinica: 'kom.', cijena: '', valuta: 'EUR', kategorija: 'Moje stavke' })
  const [filter, setFilter] = useState('')

  useEffect(() => { ucitaj() }, [])

  const ucitaj = async () => {
    setLoading(true)
    const { data } = await supabase.from('moja_baza').select('*').order('kreiran_at', { ascending: false })
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
      await supabase.from('moja_baza').insert({
        naziv: nova.naziv, jedinica: nova.jedinica,
        cijena: parseFloat(nova.cijena) || 0, valuta: nova.valuta || 'EUR', kategorija: nova.kategorija
      })
    }
    setForma(false); setEditId(null)
    setNova({ naziv: '', jedinica: 'kom.', cijena: '', valuta: 'EUR', kategorija: 'Moje stavke' })
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

  const filtrirane = stavke.filter(s => s.naziv.toLowerCase().includes(filter.toLowerCase()))

  const inp = (val, set, ph, type='text') => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0', marginBottom: 8 }} />
  )
  const selStil = { width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0', marginBottom: 8, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

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
              {kategorije.map(k => <option key={k} value={k}>{k}</option>)}
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
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E5DC', display: 'flex', gap: 8 }}>
            <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="🔍 Pretraži svoje stavke..."
              style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', background: '#F5F4F0' }} />
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
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Vaša baza je prazna</div>
              <div style={{ fontSize: 13 }}>Dodajte stavke koje često koristite u projektima</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F5F4F0' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Naziv</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>J.mj.</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Cijena</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#888' }}>Kategorija</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrirane.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #EEECEA' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAF8'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '9px 16px', lineHeight: 1.4 }}>{s.naziv}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#888' }}>{s.jedinica}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>
                      {s.cijena > 0 ? `${s.cijena.toFixed(2)} ${s.valuta || 'EUR'}` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#888', fontSize: 12 }}>{s.kategorija}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
                ))}
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
