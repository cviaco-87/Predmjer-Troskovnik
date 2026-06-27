import { useState, useRef, useEffect } from "react"

const SYSTEM_PROMPT = `Ti si stručni asistent za predmjer i predračun građevinskih radova na srpskom jeziku (ijekavica).

Tvoja uloga je da pomažeš korisnicima da:
1. Generišu kompletne, detaljne stavke predmjera
2. Dopunjuju i poboljšavaju postojeće stavke
3. Predlažu stavke sa specificiranim proizvodima poznatih proizvođača (Knauf, Rigips, Weber, Mapei, Rockwool, Isover, Ytong, Porotherm, Rehau, Wavin, itd.)
4. Upozoravaju na propuste u predmjeru

PRAVILA ZA GENERISANJE STAVKI:
- Uvijek piši na srpskom jeziku, ISKLJUČIVO IJEKAVICA (nije ekavica!)
- Stavka mora biti detaljna i kompletna - da izvođač zna tačno šta treba uraditi
- Uključi: pripremu podloge, materijale, način ugradnje, tolerancije, završnu obradu
- Na kraju stavke uvijek napiši "Obračun po [jed.mjere]."
- Jedinice mjere: m2, m3, m1, kom., pau., kg, t
- Cijene u EUR, realne tržišne cijene za region BiH/Srbija/Hrvatska

FORMAT ODGOVORA KADA GENERIŠEŠ STAVKU:
Kada korisnik traži novu stavku, odgovori u ovom formatu:

---STAVKA---
NAZIV: [kratki naziv stavke]
OPIS: [kompletan opis, 3-8 rečenica]
JMJ: [m2/m3/m1/kom./pau./kg]
CIJENA: [broj u EUR]
KATEGORIJA: [kategorija]
---KRAJ---

Zatim dodaj kratko objašnjenje zašto si uključio određene elemente.

KATEGORIJE koje postoje:
- Pripremno završni radovi
- Istraživački radovi  
- Demontaže i rušenja
- Zemljani radovi
- Zidarski radovi
- Betonski i arm. betonski
- Tesarski radovi
- Pokrivački radovi
- Izolaterski radovi
- Građevinska stolarija
- Stolarski radovi
- Limarski radovi
- Staklorezački radovi
- Keramičarski radovi
- Teracerski radovi
- Kamenorezački radovi
- Parketarski radovi
- Podopolagački radovi
- Gipsarski radovi
- Fasaderski radovi
- Likorezački radovi
- Molersko-farbarski radovi
- Tapetarski radovi
- Livački radovi
- Razni zanatski radovi
- Bravarski radovi
- Roletnarski radovi
- Suvomontažni radovi
- Vodovod
- Kanalizacija
- Sanitarni uređaji

PRIMJERI DOBRIH STAVKI:
- "Izrada pregradnog zida od gips-kartonskih ploča Knauf, sistem W112, debljine 12,5 cm. Metalnu podkonstrukciju od UW i CW profila 75 mm postaviti na osnom razmaku od 62,5 cm. S obje strane postaviti po jednu gips-kartonsku ploču debljine 12,5 mm. Prostor između ploča ispuniti mineralnom vunom Knauf Insulation debljine 50 mm, λ=0,035 W/mK. Spojeve ploča i uglove obraditi Knauf Fugenfüller kitom i armirnom trakom. Površinu zagletovati Knauf Uniflott finišom, brusiti i pripremiti za bojenje. Obračun po m2 izvedenog zida."

Budi konkretan, profesionalan i koristi standardnu građevinsku terminologiju.`

// Parsira odgovor AI-a i izvlaci stavku ako postoji
function parseStavka(text) {
  const match = text.match(/---STAVKA---([\s\S]*?)---KRAJ---/)
  if (!match) return null
  
  const blok = match[1]
  const naziv = blok.match(/NAZIV:\s*(.+)/)?.[1]?.trim()
  const opis = blok.match(/OPIS:\s*([\s\S]+?)(?=JMJ:|$)/)?.[1]?.trim()
  const jmj = blok.match(/JMJ:\s*(.+)/)?.[1]?.trim()
  const cijenaStr = blok.match(/CIJENA:\s*(.+)/)?.[1]?.trim()
  const kategorija = blok.match(/KATEGORIJA:\s*(.+)/)?.[1]?.trim()
  
  const cijena = parseFloat(cijenaStr?.replace(',', '.')) || 0
  
  if (!naziv || !opis) return null
  
  return { naziv, opis, jmj: jmj || 'kom.', cijena, kategorija: kategorija || 'Ostalo' }
}

// Formatira tekst odgovora (uklanja blok stavke, prikazuje samo komentar)
function formatOdgovor(text) {
  return text.replace(/---STAVKA---[\s\S]*?---KRAJ---/, '').trim()
}

export default function AIAsistent({ aktivnaFaza, onDodajStavku, onClose }) {
  const [poruke, setPoruke] = useState([
    {
      uloga: 'asistent',
      tekst: `Zdravo! Ja sam vaš AI asistent za predmjer i predračun. 🏗️

Mogu vam pomoći da:
• **Generišete** kompletne, detaljne stavke predmjera
• **Dopunite** kratke ili nepotpune stavke
• **Predložim** stavke sa specificiranim proizvodima (Knauf, Rigips, Weber, Mapei...)
• **Pregledam** vaš predmjer i upozorim na propuste

${aktivnaFaza ? `Trenutno radite na fazi: **${aktivnaFaza.naziv}**` : ''}

Kako mogu pomoći? Opišite šta vam treba — npr:
*"Treba mi stavka za gips karton pregradni zid Knauf W112 debljine 10cm"*
*"Napravi stavku za hidroizolaciju kupatila membranom"*
*"Kakve stavke trebam za kompletno malterisanje fasade?"*`,
      stavka: null
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const [historija, setHistorija] = useState([]) // za API context

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [poruke])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const posalji = async () => {
    const tekst = input.trim()
    if (!tekst || loading) return

    const novaPoruka = { uloga: 'korisnik', tekst, stavka: null }
    setPoruke(prev => [...prev, novaPoruka])
    setInput('')
    setLoading(true)

    // Pripremi historiju za API
    const novaHistorija = [
      ...historija,
      { role: 'user', content: tekst }
    ]

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: novaHistorija
        })
      })

      const data = await response.json()
      const odgovorTekst = data.content?.[0]?.text || 'Greška u odgovoru.'

      // Pokušaj parsirati stavku
      const stavka = parseStavka(odgovorTekst)
      const prikazTekst = stavka ? formatOdgovor(odgovorTekst) : odgovorTekst

      setPoruke(prev => [...prev, {
        uloga: 'asistent',
        tekst: prikazTekst,
        stavka
      }])

      // Ažuriraj historiju
      setHistorija([
        ...novaHistorija,
        { role: 'assistant', content: odgovorTekst }
      ])
    } catch (e) {
      setPoruke(prev => [...prev, {
        uloga: 'asistent',
        tekst: 'Greška u komunikaciji sa AI servisom. Pokušajte ponovo.',
        stavka: null
      }])
    }

    setLoading(false)
  }

  const dodajUPredmjer = (stavka) => {
    if (!aktivnaFaza) {
      alert('Molimo odaberite fazu predmjera prije dodavanja stavke.')
      return
    }
    onDodajStavku({
      naziv: stavka.naziv + '. ' + stavka.opis,
      cijena: stavka.cijena,
      jedinica: stavka.jmj,
      kategorija: stavka.kategorija
    })
  }

  // Renderuje markdown-like tekst
  const renderTekst = (tekst) => {
    if (!tekst) return null
    const linije = tekst.split('\n')
    return linije.map((linija, idx) => {
      // Bold **tekst**
      const parsed = linija.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      if (linija.startsWith('•') || linija.startsWith('*') || linija.startsWith('-')) {
        return <div key={idx} style={{ paddingLeft: 12, marginBottom: 2 }}
          dangerouslySetInnerHTML={{ __html: '&bull; ' + parsed.replace(/^[•*\-]\s*/, '') }} />
      }
      if (!linija.trim()) return <div key={idx} style={{ height: 6 }} />
      return <div key={idx} style={{ marginBottom: 2 }}
        dangerouslySetInnerHTML={{ __html: parsed }} />
    })
  }

  const brziPrimjeri = [
    '🏗️ Gips karton pregradni zid Knauf W112 10cm',
    '🛁 Hidroizolacija kupatila membranom',
    '🪟 Ugradnja PVC prozora sa trostrukim staklom',
    '🧱 Malterisanje fasade sa termoizolacijom EPS 10cm',
    '🚿 Kompletna instalacija kupatila - šta sve treba?',
  ]

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, width: 420, height: 580,
      background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column', zIndex: 300,
      border: '1px solid #D8D5CC', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
        color: '#fff', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18
        }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>AI Asistent</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            {aktivnaFaza ? `Faza: ${aktivnaFaza.naziv}` : 'Predmjer / Troškovnik'}
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 13 }}>
          ✕ Zatvori
        </button>
      </div>

      {/* Poruke */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {poruke.map((p, idx) => (
          <div key={idx} style={{
            marginBottom: 14,
            display: 'flex',
            flexDirection: p.uloga === 'korisnik' ? 'row-reverse' : 'row',
            gap: 8, alignItems: 'flex-start'
          }}>
            {/* Avatar */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: p.uloga === 'korisnik' ? '#1B4332' : '#E8F0EC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: p.uloga === 'korisnik' ? '#fff' : '#1B4332'
            }}>
              {p.uloga === 'korisnik' ? '👤' : '✨'}
            </div>

            <div style={{ maxWidth: '85%' }}>
              {/* Balon poruke */}
              {p.tekst && (
                <div style={{
                  background: p.uloga === 'korisnik' ? '#1B4332' : '#F5F4F0',
                  color: p.uloga === 'korisnik' ? '#fff' : '#1A1A18',
                  borderRadius: p.uloga === 'korisnik' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  padding: '10px 13px', fontSize: 12.5, lineHeight: 1.6
                }}>
                  {renderTekst(p.tekst)}
                </div>
              )}

              {/* Kartica generisane stavke */}
              {p.stavka && (
                <div style={{
                  marginTop: 8, background: '#fff', border: '2px solid #1B4332',
                  borderRadius: 10, overflow: 'hidden'
                }}>
                  <div style={{
                    background: '#1B4332', color: '#fff',
                    padding: '8px 12px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    ✅ Generisana stavka
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1B4332', marginBottom: 4 }}>
                      {p.stavka.naziv}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#444', lineHeight: 1.5, marginBottom: 8 }}>
                      {p.stavka.opis.length > 200 ? p.stavka.opis.slice(0, 200) + '...' : p.stavka.opis}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ background: '#E8F0EC', color: '#1B4332', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                        {p.stavka.jmj}
                      </span>
                      <span style={{ background: '#E8F0EC', color: '#1B4332', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                        {p.stavka.cijena > 0 ? p.stavka.cijena.toFixed(2) + ' €' : 'cijena po dogovoru'}
                      </span>
                      <span style={{ background: '#F0F0EE', color: '#666', padding: '2px 8px', borderRadius: 20, fontSize: 10 }}>
                        {p.stavka.kategorija}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => dodajUPredmjer(p.stavka)}
                        style={{
                          flex: 1, background: '#1B4332', color: '#fff', border: 'none',
                          borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit'
                        }}>
                        + Dodaj u predmjer
                      </button>
                      <button
                        onClick={() => {
                          setInput('Možeš li ovu stavku proširiti i dodati više detalja?')
                          inputRef.current?.focus()
                        }}
                        style={{
                          background: '#F5F4F0', color: '#1B4332', border: '1px solid #D8D5CC',
                          borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
                        }}>
                        ✏️ Proširi
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8F0EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✨</div>
            <div style={{ background: '#F5F4F0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#1B4332',
                    animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.2}s`,
                    opacity: 0.6
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Brzi primjeri - samo na početku */}
        {poruke.length === 1 && !loading && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Brzi primjeri:</div>
            {brziPrimjeri.map((primjer, idx) => (
              <button key={idx}
                onClick={() => { setInput(primjer.replace(/^[^\s]+\s/, '')); inputRef.current?.focus() }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: '#F5F4F0', border: '1px solid #E0DDD5',
                  borderRadius: 8, padding: '7px 10px', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4,
                  color: '#1A1A18'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#E8F0EC'}
                onMouseLeave={e => e.currentTarget.style.background = '#F5F4F0'}>
                {primjer}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid #E8E5DC',
        background: '#fff', flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); posalji() }
            }}
            placeholder="Opišite šta vam treba... (Enter za slanje, Shift+Enter za novi red)"
            rows={2}
            style={{
              flex: 1, border: '1px solid #D8D5CC', borderRadius: 10,
              padding: '8px 12px', fontSize: 12.5, fontFamily: 'inherit',
              resize: 'none', lineHeight: 1.5, background: '#F5F4F0',
              outline: 'none'
            }}
            onFocus={e => e.target.style.borderColor = '#1B4332'}
            onBlur={e => e.target.style.borderColor = '#D8D5CC'}
          />
          <button
            onClick={posalji}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#ccc' : '#1B4332',
              color: '#fff', border: 'none', borderRadius: 10,
              width: 40, height: 40, fontSize: 18, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
            {loading ? '⏳' : '➤'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 5, textAlign: 'center' }}>
          AI asistent · Uvijek provjerite stavke sa stručnjakom
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
