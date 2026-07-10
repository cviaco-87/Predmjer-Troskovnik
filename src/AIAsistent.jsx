import { useState, useRef, useEffect } from "react"

const VALUTE = [
  { kod: 'EUR', znak: '€', naziv: 'Euro' },
  { kod: 'KM',  znak: 'KM', naziv: 'Konvertibilna marka' },
  { kod: 'RSD', znak: 'din', naziv: 'Srpski dinar' },
  { kod: 'USD', znak: '$', naziv: 'Američki dolar' },
]

const SYSTEM_PROMPT = `Ti si stručni asistent za predmjer i predračun građevinskih radova na srpskom jeziku (ijekavica).

Tvoja uloga je da pomažeš korisnicima da:
1. Generišu kompletne, detaljne stavke predmjera
2. Dopunjuju i poboljšavaju postojeće stavke
3. Predlažu stavke sa specificiranim proizvodima poznatih proizvođača (Knauf, Rigips, Weber, Mapei, Rockwool, Isover, Ytong, Porotherm, Rehau, Wavin, itd.)
4. Upozoravaju na propuste u predmjeru
5. Procjenjuju i ažuriraju cijene za sve stavke

PRAVILA ZA GENERISANJE STAVKI:
- Uvijek piši na srpskom jeziku, ISKLJUČIVO IJEKAVICA (nije ekavica!)
- Stavka mora biti detaljna i kompletna - da izvođač zna tačno šta treba uraditi
- Uključi: pripremu podloge, materijale, način ugradnje, tolerancije, završnu obradu
- Na kraju stavke uvijek napiši "Obračun po [jed.mjere]."
- Jedinice mjere: m2, m3, m1, kom., pau., kg, t

FORMAT ODGOVORA KADA GENERIŠEŠ STAVKU:
Kada korisnik traži novu stavku, odgovori u ovom formatu:

---STAVKA---
NAZIV: [kratki naziv stavke]
OPIS: [kompletan opis, 3-8 rečenica]
JMJ: [m2/m3/m1/kom./pau./kg]
CIJENA: [broj]
KATEGORIJA: [kategorija]
---KRAJ---

Zatim dodaj kratko objašnjenje zašto si uključio određene elemente.

FORMAT ODGOVORA KADA PROCJENJUJEŠ CIJENE:
Kada korisnik traži procjenu cijena za više stavki, odgovori ISKLJUČIVO u ovom JSON formatu (bez ikakvog drugog teksta prije ili poslije):

---CIJENE---
{
  "valuta": "EUR",
  "stavke": [
    { "id": "ID_STAVKE", "cijena": 45.00, "obrazlozenje": "kratko obrazloženje" }
  ]
}
---KRAJ-CIJENA---

PRAVILA ZA PROCJENU CIJENA:
- Analiziraj svaki opis stavke pažljivo
- Cijene trebaju biti realne tržišne cijene za region BiH/Srbija/Hrvatska
- Stavke mogu biti organizovane hijerarhijski: RODITELJ stavka može imati PODSTAVKE (npr. "prizemlje", "sprat")
- Ako stavka piše "[RODITELJ - ima podstavke, NE procjenjuj cijenu]" - PRESKOČI je, ne vraćaj cijenu za nju
- Procijeni cijenu ISKLJUČIVO za stavke koje imaju "ID:" naznačen - to su stavke gdje se cijena upisuje (obične stavke i podstavke)
- Sve podstavke jedne stavke (npr. prizemlje, sprat) obično imaju ISTU ili vrlo sličnu jediničnu cijenu, jer opisuju isti rad u različitim zonama - koristi to kao smjernicu
- Ako korisnik kaže "u KM" ili "u markama" postavi valuta:"KM"
- Ako korisnik kaže "u dinarima" ili "u RSD" postavi valuta:"RSD"
- Ako korisnik kaže "u dolarima" ili "u USD" postavi valuta:"USD"
- Inače koristi valuta:"EUR"
- Koristi web search ako je dostupan da provjeriš aktuelne tržišne cijene
- U odgovoru MORAŠ vratiti procjenu za SVAKU stavku koja ima "ID:" naznačen, uključujući sve podstavke

FORMAT ODGOVORA KADA KORISNIK TRAŽI PREGLED/POBOLJŠANJE POSTOJEĆEG DOKUMENTA:
Kada korisnik traži da pregledaš, analiziraš, poboljšaš, ili predložiš izmjene za POSTOJEĆE stavke u predmjeru (ne novu stavku), odgovori ISKLJUČIVO u ovom JSON formatu (bez ikakvog drugog teksta prije ili poslije):

---IZMJENE---
{
  "stavke": [
    { "id": "ID_STAVKE", "noviOpis": "kompletan poboljšan tekst opisa stavke, spreman da zamijeni postojeći", "obrazlozenje": "kratko obrazloženje šta je i zašto promijenjeno" }
  ]
}
---KRAJ-IZMJENA---

PRAVILA ZA PREGLED/POBOLJŠANJE:
- Vrati SAMO stavke koje stvarno trebaju izmjenu ili poboljšanje - ne moraš vraćati stavke koje su već potpune i dobre
- "noviOpis" mora biti KOMPLETAN i KONAČAN novi tekst cijele stavke (naziv + puni opis spojeno), NE samo razlika ili dodatak
- Ova izmjena se upisuje DIREKTNO u postojeću stavku (zamjenjuje stari tekst), NE kreira se nova stavka
- Uzmi u obzir hijerarhiju: ako je podstavka označena kao dio roditelja, poboljšaj samo njen kratki opis (npr. "prizemlje"), ne cijelu tehničku specifikaciju
- Traži: nepotpune opise, nejasne formulacije, nedostatak standarda/normi, propuste u tehničkim detaljima, pogrešnu terminologiju
- Zadrži postojeću jedinicu mjere i strukturu, samo poboljšaj tekst
- Piši isključivo na srpskom jeziku, ijekavica
- Ne mijenjaj cijene u ovom formatu, samo tekst opisa

KADA KORISNIK PRILOŽI POSTOJEĆE STAVKE BEZ POTPUNO JASNOG FORMATA ZAHTJEVA:
Ako uz poruku dobiješ listu postojećih stavki iz predmjera, ali korisnikova formulacija nije eksplicitno "procijeni/ažuriraj cijene" niti "pregledaj/poboljšaj opise", sam odluči na osnovu konteksta rečenice:
- Ako korisnik spominje cijene, iznose, troškove, tržišne vrijednosti → koristi ---CIJENE--- format
- Ako korisnik spominje opise, tekst, formulacije, kvalitet, propuste, standarde → koristi ---IZMJENE--- format
- Ako je i dalje nejasno, radije pitaj kratko jedno pojašnjavajuće pitanje nego da nagađaš i vratiš pogrešan format
U svakom od ova dva formata MORAŠ obuhvatiti SVE priložene stavke koje odgovaraju traženoj radnji, ne samo dio njih.

KATEGORIJE koje postoje:
- Pripremno-završni radovi
- Demontaže i rušenja
- Zemljani radovi
- Betonski i AB radovi
- Zidarski radovi
- Izolaterski radovi
- Tesarski radovi
- Pokrivački radovi
- Fasaderski radovi
- Limarski radovi
- Građevinska stolarija
- Bravarski radovi
- Gipsarski radovi
- Podopolagački radovi
- Molersko-farbarski radovi
- Stolarski radovi
- Kamenorezački radovi
- Konzervatorski radovi
- Staklorezački radovi
- Protivpožarna zaštita
- Sanitarni uređaji
- Vodovod i kanalizacija
- Elektroinstalacije
- Mašinske instalacije
- Vanjsko uređenje

Budi konkretan, profesionalan i koristi standardnu građevinsku terminologiju.`

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

function parseCijene(text) {
  const match = text.match(/---CIJENE---([\s\S]*?)---KRAJ-CIJENA---/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) }
  catch(e) { return null }
}

function parseIzmjene(text) {
  const match = text.match(/---IZMJENE---([\s\S]*?)---KRAJ-IZMJENA---/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) }
  catch(e) { return null }
}

function formatOdgovor(text) {
  return text
    .replace(/---STAVKA---[\s\S]*?---KRAJ---/, '')
    .replace(/---CIJENE---[\s\S]*?---KRAJ-CIJENA---/, '')
    .replace(/---IZMJENE---[\s\S]*?---KRAJ-IZMJENA---/, '')
    .trim()
}

export default function AIAsistent({ aktivnaFaza, pozicije, onDodajStavku, onProcijeniCijene, onPrimijeniIzmjene, onSetValuta, onClose, session }) {
  const [poruke, setPoruke] = useState([{
    uloga: 'asistent',
    tekst: `Zdravo! Ja sam vaš AI asistent za predmjer i predračun. 🏗️

Mogu vam pomoći da:
• **Generišete** kompletne, detaljne stavke predmjera
• **Dopunite** kratke ili nepotpune stavke
• **Predložim** stavke sa specificiranim proizvodima (Knauf, Rigips, Weber, Mapei...)
• **Procijenim cijene** za sve stavke u predmjeru (sa web pretragom aktuelnih cijena)
• **Pregledam cijeli predmjer** i poboljšam postojeće stavke direktno (bez dodavanja novih)

${aktivnaFaza ? `Trenutno radite na grupi radova: **${aktivnaFaza.naziv}**` : ''}

Kako mogu pomoći? Npr:
*"Pregledaj kompletan predmjer i predloži poboljšanja"*
*"Procijeni cijene za sve stavke u KM"*
*"Treba mi stavka za gips karton pregradni zid"*`,
    stavka: null,
    cijene: null
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalCijene, setModalCijene] = useState(null)
  const [modalIzmjene, setModalIzmjene] = useState(null) // { stavke: [{id, stariOpis, noviOpis, obrazlozenje, prihvacena}] }
  const [primjenaLoading, setPrimjenaLoading] = useState(false)
  // Posljednja primijenjena AI grupna izmjena (cijene ili opisi) — omogućava opoziv jednim
  // klikom, sve dok korisnik ne primijeni neku SLJEDEĆU grupnu izmjenu (samo jedan nivo undo-a,
  // isto kao i undo brisanja pozicije u App.jsx — jednostavno i predvidljivo, ne pun undo/redo stog).
  const [zadnjaAIizmjena, setZadnjaAIizmjena] = useState(null) // { tip: 'cijene'|'izmjene', stavke: [{id, staraVrijednost, novaVrijednost}] }
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const [historija, setHistorija] = useState([])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [poruke])
  useEffect(() => { inputRef.current?.focus() }, [])

  // Puni kontekst (necenzurisan opis) - koristi se za pregled/poboljšanje dokumenta
  const getStavkeKontekstPuni = () => {
    if (!pozicije || pozicije.length === 0) return '(nema stavki u ovoj grupi radova)'
    const roditelji = pozicije.filter(p => !p.parent_id)
    const linije = []
    roditelji.forEach((p, i) => {
      const djeca = pozicije.filter(d => d.parent_id === p.id)
      const nazivR = (p.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1')
      if (djeca.length > 0) {
        linije.push(`${i + 1}. ID:${p.id} [RODITELJ sa ${djeca.length} podstavki] OPIS: "${nazivR}"`)
        djeca.forEach((d, j) => {
          const nazivD = (d.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1') || `(bez naziva)`
          linije.push(`  ${i + 1}.${j + 1}. ID:${d.id} [PODSTAVKA] OPIS: "${nazivD}"`)
        })
      } else {
        linije.push(`${i + 1}. ID:${p.id} OPIS: "${nazivR}"`)
      }
    })
    return linije.join('\n')
  }

  // Skraćeni kontekst - koristi se za procjenu cijena
  const getStavkeKontekst = () => {
    if (!pozicije || pozicije.length === 0) return '(nema stavki u ovoj grupi radova)'
    const roditelji = pozicije.filter(p => !p.parent_id)
    const linije = []
    roditelji.forEach((p, i) => {
      const djeca = pozicije.filter(d => d.parent_id === p.id)
      const nazivR = (p.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 100)
      if (djeca.length > 0) {
        // Roditelj sa podstavkama - cijena mu je zbir, ne procjenjuje se direktno
        linije.push(`${i + 1}. ${nazivR} [RODITELJ - ima ${djeca.length} podstavki, cijena je zbir, NE procjenjuj cijenu za ovu stavku]`)
        djeca.forEach((d, j) => {
          const nazivD = (d.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 100) || `(podstavka ${j + 1} bez naziva, dio: "${nazivR}")`
          linije.push(`  ID:${d.id} | ${i + 1}.${j + 1} ${nazivD} | jed: ${d.jedinica} | trenutna cijena: ${d.cijena || 0}`)
        })
      } else {
        linije.push(`ID:${p.id} | ${i + 1}. ${nazivR} | jed: ${p.jedinica} | trenutna cijena: ${p.cijena || 0}`)
      }
    })
    return linije.join('\n')
  }

  const posalji = async () => {
    const tekst = input.trim()
    if (!tekst || loading) return

    setPoruke(prev => [...prev, { uloga: 'korisnik', tekst, stavka: null, cijene: null }])
    setInput('')
    setLoading(true)

    const trazeCijene = /procijen|procjen\w*(\s+\w+){0,2}\s+cijen|ažuriraj cijen|azuriraj cijen|update cijen|updateuj cijen|cijene za sve|sve cijene|nove cijene|osvježi cijen|osvjezi cijen|korigu?j cijen/i.test(tekst)
    const trazeIzmjene = /pregledaj|pregled\s|poboljšaj|poboljsaj|poboljšanj|poboljsanj|predlo[žz]i?\s*izmjen|analiziraj|nedostac|propust|recenzij|korigu?j(?!\s*cijen)|dopuni|nadopuni|uredi\b|sredi\b/i.test(tekst) && !trazeCijene

    // Fallback: korisnik često samo kaže "sve stavke iz X", "kompletnu fazu", "cijelu grupu Y" i sl.,
    // bez ijedne od gornjih ključnih riječi (procijeni/pregledaj/poboljšaj...). Ako poruka jasno
    // upućuje na masovnu/skupu radnju nad postojećim stavkama (a ne na kreiranje nove stavke od
    // nule), radije priloži skraćeni kontekst pozicija nego da asistent ostane bez uvida u dokument.
    const spominjeMasovnost = /\bsve\b|\bsva\b|\bsvih\b|\bkompletn|\bcijel|\bcel\w*\b|\bfaz[ue]\b|\bgrup[ue]\b|\bdokument|\bpredmjer/i.test(tekst)
    const trazeNovuStavku = /napravi\s+(novu|jednu)\s+stavk|dodaj\s+(novu|jednu)\s+stavk|kreiraj\s+(novu|jednu)\s+stavk/i.test(tekst)
    const trazeMasovnuRadnju = !trazeCijene && !trazeIzmjene && spominjeMasovnost && !trazeNovuStavku

    let userContent = tekst
    if (trazeCijene && pozicije && pozicije.length > 0) {
      userContent = `${tekst}

STAVKE U PREDMJERU (procijeni cijene za svaku):
${getStavkeKontekst()}

Vrati odgovor ISKLJUČIVO u ---CIJENE--- formatu za sve stavke.`
    } else if (trazeIzmjene && pozicije && pozicije.length > 0) {
      userContent = `${tekst}

POSTOJEĆE STAVKE U PREDMJERU (pregledaj svaku i predloži poboljšanja gdje je potrebno):
${getStavkeKontekstPuni()}

Vrati odgovor ISKLJUČIVO u ---IZMJENE--- formatu. Vrati samo stavke koje trebaju izmjenu.`
    } else if (trazeMasovnuRadnju && pozicije && pozicije.length > 0) {
      // Nismo sigurni traži li korisnik cijene ili tekstualne izmjene — prilažemo pun kontekst
      // i prepuštamo modelu da po svom nahođenju (na osnovu SYSTEM_PROMPT uputstava) odluči
      // koji format odgovora (---CIJENE--- ili ---IZMJENE---) odgovara traženoj radnji.
      userContent = `${tekst}

POSTOJEĆE STAVKE U PREDMJERU (ovo je kompletan sadržaj trenutne grupe radova "${aktivnaFaza?.naziv || ''}"):
${getStavkeKontekstPuni()}

Na osnovu onoga što korisnik traži, odgovori u odgovarajućem formatu: ---CIJENE--- ako se traži ažuriranje/procjena cijena, ili ---IZMJENE--- ako se traži poboljšanje/dopuna opisa. Obuhvati SVE navedene stavke, ne samo dio.`
    }

    const novaHistorija = [...historija, { role: 'user', content: userContent }]

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ system: SYSTEM_PROMPT, messages: novaHistorija, webSearch: trazeCijene || trazeMasovnuRadnju })
      })

      let data
      try { data = await response.json() }
      catch(e) { throw new Error('Server vratio neispravan odgovor (status: ' + response.status + ')') }
      if (!response.ok) throw new Error('API greška ' + response.status + ': ' + (data?.error || JSON.stringify(data)))

      const odgovorTekst = data.content?.[0]?.text || 'Prazan odgovor.'
      const stavka = parseStavka(odgovorTekst)
      const cijeneData = parseCijene(odgovorTekst)
      const izmjeneData = parseIzmjene(odgovorTekst)
      const prikazTekst = formatOdgovor(odgovorTekst)

      if (cijeneData && cijeneData.stavke && pozicije) {
        const modalStavke = cijeneData.stavke.map(s => {
          const poz = pozicije.find(p => p.id === s.id)
          if (!poz) return null
          let prikazNaziv = (poz.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 80)
          // Ako je podstavka bez naziva, prikaži naziv roditelja radi konteksta
          if (poz.parent_id && !prikazNaziv.trim()) {
            const roditelj = pozicije.find(r => r.id === poz.parent_id)
            prikazNaziv = `(podstavka) ${(roditelj?.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 60)}`
          } else if (poz.parent_id) {
            prikazNaziv = `↳ ${prikazNaziv}`
          }
          return {
            id: s.id,
            naziv: prikazNaziv,
            staraCijena: poz.cijena || 0,
            novaCijena: s.cijena,
            obrazlozenje: s.obrazlozenje || '',
            prihvacena: true
          }
        }).filter(Boolean)
        setModalCijene({ valuta: cijeneData.valuta || 'EUR', stavke: modalStavke })
      }

      if (izmjeneData && izmjeneData.stavke && pozicije) {
        const modalStavke = izmjeneData.stavke.map(s => {
          const poz = pozicije.find(p => p.id === s.id)
          if (!poz) return null
          return {
            id: s.id,
            stariOpis: poz.naziv || '',
            noviOpis: s.noviOpis || '',
            obrazlozenje: s.obrazlozenje || '',
            prihvacena: true
          }
        }).filter(Boolean)
        if (modalStavke.length > 0) {
          setModalIzmjene({ stavke: modalStavke })
        }
      }

      setPoruke(prev => [...prev, {
        uloga: 'asistent',
        tekst: cijeneData
          ? `Analizirao sam ${cijeneData.stavke?.length || 0} stavki. Prijedlog cijena je spreman za pregled — pogledajte modal ispod. ✅`
          : izmjeneData
          ? (izmjeneData.stavke?.length > 0
              ? `Pregledao sam predmjer i pronašao ${izmjeneData.stavke.length} stavki koje mogu poboljšati. Prijedlog izmjena je spreman za pregled — pogledajte modal ispod. ✅`
              : `Pregledao sam predmjer — sve stavke izgledaju kompletno, nemam prijedloge za izmjenu. 👍`)
          : (prikazTekst || odgovorTekst),
        stavka: stavka || null,
        cijene: cijeneData
      }])

      setHistorija([...novaHistorija, { role: 'assistant', content: odgovorTekst }])
    } catch (e) {
      setPoruke(prev => [...prev, { uloga: 'asistent', tekst: 'Greška: ' + (e.message || JSON.stringify(e)), stavka: null, cijene: null }])
    }
    setLoading(false)
  }

  const dodajUPredmjer = (stavka) => {
    if (!aktivnaFaza) { alert('Molimo odaberite grupu radova prije dodavanja stavke.'); return }
    onDodajStavku({ naziv: stavka.naziv + '. ' + stavka.opis, cijena: stavka.cijena, jedinica: stavka.jmj, kategorija: stavka.kategorija })
  }

  const primijeniCijene = async () => {
    if (!modalCijene) return
    setPrimjenaLoading(true)
    if (onSetValuta) onSetValuta(modalCijene.valuta)
    const prihvacene = modalCijene.stavke.filter(s => s.prihvacena)
    if (onProcijeniCijene) await onProcijeniCijene(prihvacene.map(s => ({ id: s.id, cijena: s.novaCijena })))
    setPrimjenaLoading(false)
    setModalCijene(null)
    // Zapamti staru/novu vrijednost svake stavke da bi "Opozovi" mogao vratiti tačno ove cijene
    setZadnjaAIizmjena({
      tip: 'cijene',
      stavke: prihvacene.map(s => ({ id: s.id, staraVrijednost: s.staraCijena, novaVrijednost: s.novaCijena }))
    })
    setPoruke(prev => [...prev, {
      uloga: 'asistent',
      tekst: `✅ Primijenjeno ${prihvacene.length} cijena u valuti ${modalCijene.valuta}. Možete ih ručno prilagoditi u tabeli.`,
      stavka: null, cijene: null, mozeOpozvati: true
    }])
  }

  const primijeniIzmjene = async () => {
    if (!modalIzmjene) return
    setPrimjenaLoading(true)
    const prihvacene = modalIzmjene.stavke.filter(s => s.prihvacena)
    if (onPrimijeniIzmjene) await onPrimijeniIzmjene(prihvacene.map(s => ({ id: s.id, noviOpis: s.noviOpis })))
    setPrimjenaLoading(false)
    setModalIzmjene(null)
    setZadnjaAIizmjena({
      tip: 'izmjene',
      stavke: prihvacene.map(s => ({ id: s.id, staraVrijednost: s.stariOpis, novaVrijednost: s.noviOpis }))
    })
    setPoruke(prev => [...prev, {
      uloga: 'asistent',
      tekst: `✅ Primijenjeno ${prihvacene.length} izmjena direktno u postojeće stavke. Ništa nije dodato kao nova stavka.`,
      stavka: null, cijene: null, mozeOpozvati: true
    }])
  }

  // Vraća posljednju primijenjenu AI grupnu izmjenu (cijene ili opise) na prethodne vrijednosti.
  // Radi samo za JEDNU, najskoriju grupnu izmjenu — čim se primijeni nova grupna izmjena poslije
  // ove, opoziv prethodne više nije moguć (isto ograničenje kao undo brisanja pozicije u App.jsx).
  const opozoviZadnjuAIizmjenu = async () => {
    if (!zadnjaAIizmjena) return
    setPrimjenaLoading(true)
    try {
      if (zadnjaAIizmjena.tip === 'cijene' && onProcijeniCijene) {
        await onProcijeniCijene(zadnjaAIizmjena.stavke.map(s => ({ id: s.id, cijena: s.staraVrijednost })))
      } else if (zadnjaAIizmjena.tip === 'izmjene' && onPrimijeniIzmjene) {
        await onPrimijeniIzmjene(zadnjaAIizmjena.stavke.map(s => ({ id: s.id, noviOpis: s.staraVrijednost })))
      }
      setPoruke(prev => [...prev, {
        uloga: 'asistent',
        tekst: `↩️ Opozvano — vraćeno na prethodne vrijednosti za ${zadnjaAIizmjena.stavke.length} stavki.`,
        stavka: null, cijene: null
      }])
    } catch (e) {
      setPoruke(prev => [...prev, { uloga: 'asistent', tekst: 'Greška pri opozivu: ' + e.message, stavka: null, cijene: null }])
    }
    setPrimjenaLoading(false)
    setZadnjaAIizmjena(null)
  }

  const renderTekst = (tekst) => {
    if (!tekst) return null
    return tekst.split('\n').map((linija, idx) => {
      const parsed = linija.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      if (linija.startsWith('•') || linija.startsWith('*') || linija.startsWith('-'))
        return <div key={idx} style={{ paddingLeft: 12, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: '&bull; ' + parsed.replace(/^[•*\-]\s*/, '') }} />
      if (!linija.trim()) return <div key={idx} style={{ height: 6 }} />
      return <div key={idx} style={{ marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: parsed }} />
    })
  }

  const fmtC = (n, valuta) => {
    const v = VALUTE.find(x => x.kod === valuta)
    return `${(n||0).toFixed(2)} ${v?.znak || valuta}`
  }

  const brziPrimjeri = [
    '📝 Pregledaj kompletan predmjer i predloži poboljšanja',
    '💰 Procijeni cijene za sve stavke u EUR',
    '💰 Procijeni cijene za sve stavke u KM',
    '🏗️ Gips karton pregradni zid Knauf W112 10cm',
    '🛁 Hidroizolacija kupatila membranom',
  ]

  return (
    <div style={{ position: 'fixed', bottom: 80, right: 20, width: 440, height: 600, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', zIndex: 300, border: '1px solid #D8D5CC', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1B2F43, #2D4B6A)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>AI Asistent</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{aktivnaFaza ? `Grupa radova: ${aktivnaFaza.naziv}` : 'Predmjer / Troškovnik'}</div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 13 }}>✕ Zatvori</button>
      </div>

      {/* Modal procjene cijena */}
      {modalCijene && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxHeight: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#1B2F43', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>💰 Prijedlog cijena — {modalCijene.valuta}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Pregledajte i prihvatite ili odbijte svaku cijenu</div>
              </div>
              <button onClick={() => setModalCijene(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {modalCijene.stavke.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: s.prihvacena ? '#EEF2F5' : '#f9f9f9', border: `1px solid ${s.prihvacena ? '#4A637C' : '#e0e0e0'}` }}>
                  <input type="checkbox" checked={s.prihvacena}
                    onChange={e => setModalCijene(prev => ({ ...prev, stavke: prev.stavke.map((x,j) => j===i ? {...x, prihvacena: e.target.checked} : x) }))}
                    style={{ marginTop: 3, cursor: 'pointer', width: 15, height: 15 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1B2F43', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.naziv}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: '#888', textDecoration: 'line-through' }}>{fmtC(s.staraCijena, modalCijene.valuta)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1B2F43' }}>→ {fmtC(s.novaCijena, modalCijene.valuta)}</span>
                    </div>
                    {s.obrazlozenje && <div style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>{s.obrazlozenje}</div>}
                  </div>
                  <input type="number" value={s.novaCijena} min="0" step="0.5"
                    onChange={e => setModalCijene(prev => ({ ...prev, stavke: prev.stavke.map((x,j) => j===i ? {...x, novaCijena: parseFloat(e.target.value)||0} : x) }))}
                    style={{ width: 70, textAlign: 'right', border: '1px solid #D8D5CC', borderRadius: 6, padding: '3px 5px', fontSize: 12, fontFamily: 'inherit' }} />
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid #E8E5DC', display: 'flex', gap: 8 }}>
              <button onClick={() => setModalCijene(null)} style={{ flex: 1, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, padding: '8px 0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Otkaži</button>
              <button onClick={() => setModalCijene(prev => ({ ...prev, stavke: prev.stavke.map(s => ({...s, prihvacena: true})) }))} style={{ background: '#E8ECF0', border: '1px solid #4A637C', color: '#1B2F43', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Sve ✓</button>
              <button onClick={primijeniCijene} disabled={primjenaLoading}
                style={{ flex: 2, background: primjenaLoading ? '#ccc' : '#1B2F43', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: primjenaLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {primjenaLoading ? 'Primjenjujem...' : `✅ Primijeni ${modalCijene.stavke.filter(s=>s.prihvacena).length} cijena`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pregleda/poboljšanja postojećih stavki */}
      {modalIzmjene && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxHeight: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#1B2F43', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>📝 Prijedlog izmjena stavki</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Izmjena se upisuje direktno u postojeću stavku — ništa se ne dodaje kao novo</div>
              </div>
              <button onClick={() => setModalIzmjene(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {modalIzmjene.stavke.map((s, i) => (
                <div key={s.id} style={{ padding: '10px 10px', borderRadius: 8, marginBottom: 8, background: s.prihvacena ? '#EEF2F5' : '#f9f9f9', border: `1px solid ${s.prihvacena ? '#4A637C' : '#e0e0e0'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <input type="checkbox" checked={s.prihvacena}
                      onChange={e => setModalIzmjene(prev => ({ ...prev, stavke: prev.stavke.map((x,j) => j===i ? {...x, prihvacena: e.target.checked} : x) }))}
                      style={{ marginTop: 3, cursor: 'pointer', width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#999', textDecoration: 'line-through', marginBottom: 4, maxHeight: 40, overflow: 'hidden' }}>
                        {(s.stariOpis || '').replace(/\*\*([^*]+)\*\*/g, '$1').slice(0, 150)}{(s.stariOpis||'').length > 150 ? '...' : ''}
                      </div>
                      {s.obrazlozenje && <div style={{ fontSize: 10.5, color: '#4A637C', fontStyle: 'italic', marginBottom: 4 }}>💡 {s.obrazlozenje}</div>}
                    </div>
                  </div>
                  {/* Ručno izmjenjiv predloženi tekst */}
                  <textarea
                    value={s.noviOpis}
                    spellCheck={false}
                    onChange={e => setModalIzmjene(prev => ({ ...prev, stavke: prev.stavke.map((x,j) => j===i ? {...x, noviOpis: e.target.value} : x) }))}
                    rows={4}
                    style={{ width: '100%', border: '1px solid #D8D5CC', borderRadius: 6, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, background: '#fff' }} />
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid #E8E5DC', display: 'flex', gap: 8 }}>
              <button onClick={() => setModalIzmjene(null)} style={{ flex: 1, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, padding: '8px 0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Otkaži</button>
              <button onClick={() => setModalIzmjene(prev => ({ ...prev, stavke: prev.stavke.map(s => ({...s, prihvacena: true})) }))} style={{ background: '#E8ECF0', border: '1px solid #4A637C', color: '#1B2F43', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Sve ✓</button>
              <button onClick={primijeniIzmjene} disabled={primjenaLoading}
                style={{ flex: 2, background: primjenaLoading ? '#ccc' : '#1B2F43', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: primjenaLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {primjenaLoading ? 'Primjenjujem...' : `✅ Primijeni ${modalIzmjene.stavke.filter(s=>s.prihvacena).length} izmjena`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poruke */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {poruke.map((p, idx) => (
          <div key={idx} style={{ marginBottom: 14, display: 'flex', flexDirection: p.uloga === 'korisnik' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: p.uloga === 'korisnik' ? '#1B2F43' : '#E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: p.uloga === 'korisnik' ? '#fff' : '#1B2F43' }}>
              {p.uloga === 'korisnik' ? '👤' : '✨'}
            </div>
            <div style={{ maxWidth: '85%' }}>
              {p.tekst && (
                <div style={{ background: p.uloga === 'korisnik' ? '#1B2F43' : '#F5F4F0', color: p.uloga === 'korisnik' ? '#fff' : '#1A1A18', borderRadius: p.uloga === 'korisnik' ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '10px 13px', fontSize: 12.5, lineHeight: 1.6 }}>
                  {renderTekst(p.tekst)}
                </div>
              )}
              {/* Dugme za opoziv — prikazuje se samo uz POSLJEDNJU poruku u razgovoru, i samo dok
                  postoji nešto što se stvarno može opozvati (nije već opozvano ili zamijenjeno
                  novijom grupnom izmjenom) */}
              {p.mozeOpozvati && idx === poruke.length - 1 && zadnjaAIizmjena && (
                <button onClick={opozoviZadnjuAIizmjenu} disabled={primjenaLoading}
                  style={{ marginTop: 6, background: '#fff', border: '1px solid #C0392B', color: '#C0392B', borderRadius: 8, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: primjenaLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  ↩️ Opozovi ovu izmjenu
                </button>
              )}
              {p.stavka && (
                <div style={{ marginTop: 8, background: '#fff', border: '2px solid #1B2F43', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: '#1B2F43', color: '#fff', padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>✅ Generisana stavka</div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1B2F43', marginBottom: 4 }}>{p.stavka.naziv}</div>
                    <div style={{ fontSize: 11.5, color: '#444', lineHeight: 1.5, marginBottom: 8 }}>{p.stavka.opis.length > 200 ? p.stavka.opis.slice(0, 200) + '...' : p.stavka.opis}</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ background: '#E8ECF0', color: '#1B2F43', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.stavka.jmj}</span>
                      <span style={{ background: '#E8ECF0', color: '#1B2F43', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.stavka.cijena > 0 ? p.stavka.cijena.toFixed(2) + ' €' : 'cijena po dogovoru'}</span>
                      <span style={{ background: '#F0F0EE', color: '#666', padding: '2px 8px', borderRadius: 20, fontSize: 10 }}>{p.stavka.kategorija}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => dodajUPredmjer(p.stavka)} style={{ flex: 1, background: '#1B2F43', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Dodaj u predmjer</button>
                      <button onClick={() => { setInput('Možeš li ovu stavku proširiti i dodati više detalja?'); inputRef.current?.focus() }} style={{ background: '#F5F4F0', color: '#1B2F43', border: '1px solid #D8D5CC', borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>✏️ Proširi</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8ECF0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✨</div>
            <div style={{ background: '#F5F4F0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1B2F43', animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.2}s`, opacity: 0.6 }} />)}
              </div>
            </div>
          </div>
        )}

        {poruke.length === 1 && !loading && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Brzi primjeri:</div>
            {brziPrimjeri.map((primjer, idx) => (
              <button key={idx}
                onClick={() => { setInput(primjer.replace(/^[^\s]+\s/, '')); inputRef.current?.focus() }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: '#F5F4F0', border: '1px solid #E0DDD5', borderRadius: 8, padding: '7px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, color: '#1A1A18' }}
                onMouseEnter={e => e.currentTarget.style.background = '#E8ECF0'}
                onMouseLeave={e => e.currentTarget.style.background = '#F5F4F0'}>
                {primjer}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #E8E5DC', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            spellCheck={false}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); posalji() } }}
            placeholder="Opišite šta vam treba... (Enter za slanje, Shift+Enter za novi red)"
            rows={2}
            style={{ flex: 1, border: '1px solid #D8D5CC', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, background: '#F5F4F0', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = '#1B2F43'}
            onBlur={e => e.target.style.borderColor = '#D8D5CC'} />
          <button onClick={posalji} disabled={loading || !input.trim()}
            style={{ background: loading || !input.trim() ? '#ccc' : '#1B2F43', color: '#fff', border: 'none', borderRadius: 10, width: 40, height: 40, fontSize: 18, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {loading ? '⏳' : '➤'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 5, textAlign: 'center' }}>AI asistent · Uvijek provjerite stavke sa stručnjakom</div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  )
}
