import React, { useState } from 'react'

// ── UGRAĐENO UPUTSTVO ZA KORIŠĆENJE ──
// Otvara se kao modal preko cijelog ekrana, sa bočnom navigacijom po poglavljima.
// Sadržaj prati isti tok kao Word priručnik (brzi početak → detaljno → referenca).
// Namjerno je samostalna komponenta (ne dio App.jsx) da ne zatrpava glavni fajl i da se
// lako održava/dopunjuje kad se dodaju nove funkcije.

const TAMNO = '#1B2F43'
const SREDNJE = '#4A637C'
const POZADINA = '#F0F2F5'
const ZLATNA = '#C9954E'

// Mali gradivni blokovi za konzistentan izgled
const H = ({ children }) => <h2 style={{ fontSize: 20, fontWeight: 700, color: TAMNO, margin: '4px 0 14px' }}>{children}</h2>
const H3 = ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, color: SREDNJE, margin: '18px 0 8px' }}>{children}</h3>
const P = ({ children }) => <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#2B2B26', margin: '0 0 12px' }}>{children}</p>
const B = ({ children }) => <strong style={{ color: TAMNO, fontWeight: 700 }}>{children}</strong>
const Info = ({ naslov, children, boja = SREDNJE }) => (
  <div style={{ background: POZADINA, borderLeft: `4px solid ${boja}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', margin: '14px 0' }}>
    {naslov && <div style={{ fontSize: 13, fontWeight: 700, color: boja, marginBottom: 6 }}>{naslov}</div>}
    <div style={{ fontSize: 13, lineHeight: 1.65, color: '#333' }}>{children}</div>
  </div>
)
const Korak = ({ broj, naslov, children }) => (
  <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: ZLATNA, color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{broj}</div>
    <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.65, color: '#2B2B26' }}>
      <B>{naslov}</B> {children}
    </div>
  </div>
)
const Ul = ({ children }) => <ul style={{ margin: '0 0 12px', paddingLeft: 22, fontSize: 13.5, lineHeight: 1.7, color: '#2B2B26' }}>{children}</ul>
const Li = ({ children }) => <li style={{ marginBottom: 6 }}>{children}</li>

// Referentna tabela
const RefTabela = ({ redovi }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 14px', fontSize: 12.5 }}>
    <thead>
      <tr style={{ background: TAMNO, color: '#fff' }}>
        <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 700, width: '32%' }}>Opcija / dugme</th>
        <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 700 }}>Čemu služi</th>
      </tr>
    </thead>
    <tbody>
      {redovi.map((r, i) => (
        <tr key={i} style={{ background: i % 2 ? '#F7F8FA' : '#fff' }}>
          <td style={{ padding: '6px 10px', fontWeight: 700, color: TAMNO, borderBottom: '1px solid #E8E5DC' }}>{r[0]}</td>
          <td style={{ padding: '6px 10px', color: '#333', borderBottom: '1px solid #E8E5DC' }}>{r[1]}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

const POGLAVLJA = [
  { id: 'uvod', naziv: '1. Uvod', ikona: '📖' },
  { id: 'pocetak', naziv: '2. Brzi početak', ikona: '🚀' },
  { id: 'organizacija', naziv: '3. Organizacija', ikona: '🗂️' },
  { id: 'projekti', naziv: '4. Projekti', ikona: '📁' },
  { id: 'faze', naziv: '5. Faze i grupe radova', ikona: '🏗️' },
  { id: 'stavke', naziv: '6. Unos stavki', ikona: '📝' },
  { id: 'uslovi', naziv: '7. Opšti tehnički uslovi', ikona: '📋' },
  { id: 'ai', naziv: '8. AI asistent', ikona: '✨' },
  { id: 'cijene', naziv: '9. Cijene i valute', ikona: '💶' },
  { id: 'izvoz', naziv: '10. Izvoz (Excel/PDF)', ikona: '📊' },
  { id: 'referenca', naziv: '11. Brza referenca', ikona: '📑' },
  { id: 'savjeti', naziv: '12. Savjeti', ikona: '💡' },
]

export default function Uputstvo({ onClose }) {
  const [aktivno, setAktivno] = useState('uvod')

  const sadrzaj = {
    uvod: (
      <>
        <H>1. Uvod</H>
        <P><B>Predmjer / Troškovnik</B> je alat namijenjen projektantima i inženjerima za brzu i preglednu izradu predmjera i predračuna građevinskih radova. Stavke unosite iz ugrađene baze od preko 1.200 pozicija, ručno, ili uz pomoć AI asistenta, organizujete ih po fazama i strukama, i izvozite u profesionalni Excel ili PDF dokument spreman za predaju.</P>
        <P>Aplikacija je namijenjena <B>projektantima, ne izvođačima</B> — fokus je na opisu pozicija, količinama i orijentacionim cijenama za projektnu dokumentaciju.</P>
        <Info naslov="💡 Prije nego počnete">Za rad je potreban nalog (prijava putem e-pošte). Svi projekti čuvaju se sigurno i vezani su za vaš nalog — dostupni sa bilo kog uređaja nakon prijave.</Info>
      </>
    ),
    pocetak: (
      <>
        <H>2. Brzi početak — vaš prvi predmjer</H>
        <P>Šest koraka da odmah počnete. Detaljna objašnjenja slijede u narednim poglavljima.</P>
        <Korak broj="1" naslov="Kreirajte projekat.">U lijevom panelu upišite naziv u polje „Novi projekat…" i kliknite <B>+ Dodaj</B>.</Korak>
        <Korak broj="2" naslov="Popunite podatke.">U panelu „Podaci o projektu" unesite investitora, lokaciju i datum — pojavljuju se u zaglavlju dokumenta.</Korak>
        <Korak broj="3" naslov="Izaberite fazu.">Kliknite na fazu (struku) u kojoj radite — npr. Građevinsko-zanatski radovi.</Korak>
        <Korak broj="4" naslov="Dodajte grupu radova.">U panelu „Grupe radova" kreirajte grupu (npr. „Betonski radovi").</Korak>
        <Korak broj="5" naslov="Unesite stavke.">Pretražite bazu i kliknite na poziciju, ili koristite <B>+ Vlastita stavka</B> / <B>AI asistenta (✨)</B>. Zatim unesite količine.</Korak>
        <Korak broj="6" naslov="Izvezite predmjer.">U traci na vrhu kliknite <B>📊 Excel</B> ili <B>🖨 Print/PDF</B>.</Korak>
        <Info naslov="✓ To je to" boja={ZLATNA}>Ovih šest koraka pokriva osnovni tok. Sve ostalo — podstavke, opšti tehnički uslovi, AI procjena cijena, uvećanja — su dodatne mogućnosti koje koristite po potrebi.</Info>
      </>
    ),
    organizacija: (
      <>
        <H>3. Kako je aplikacija organizovana</H>
        <P>Sve je organizovano u četiri nivoa, od najšireg ka najužem:</P>
        <H3>Projekat</H3>
        <P>Najviši nivo — jedan objekat ili posao. Sadrži sve faze, grupe radova i stavke.</P>
        <H3>Faza (struka)</H3>
        <P>Podjela po strukama — Građevinsko-zanatski, Hidrotehnika, Elektro, Mašinske instalacije, Vanjsko uređenje. Svaka faza je zaseban dokument za tog izvođača.</P>
        <H3>Grupa radova</H3>
        <P>Unutar faze — logička cjelina (npr. Betonski, Zidarski). U izvozu postaje naslovljeni blok sa svojim međuzbirom.</P>
        <H3>Pozicija (stavka)</H3>
        <P>Najniži nivo — pojedinačna stavka sa opisom, jedinicom, količinom i cijenom. Može imati <B>podstavke</B> (npr. Prizemlje, Sprat 1) čiji se zbir automatski računa.</P>
        <Info naslov="📐 Primjer hijerarhije">
          <div style={{ fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.8 }}>
            <B>Projekat:</B> Stambeni objekat<br/>
            &nbsp;&nbsp;└ <B>Faza:</B> Građevinsko-zanatski radovi<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└ <B>Grupa radova:</B> Betonski radovi<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└ <B>Pozicija:</B> Betoniranje temeljne ploče — 45 m³
          </div>
        </Info>
      </>
    ),
    projekti: (
      <>
        <H>4. Rad sa projektima</H>
        <H3>Kreiranje i otvaranje</H3>
        <P>Pri svakom ulasku prikazuje se ekran za izbor projekta. Otvorite postojeći sa liste ili kreirajte novi. Aplikacija pamti gdje ste posljednji put stali u svakom projektu.</P>
        <H3>Kloniranje projekta</H3>
        <P>Dugme <B>⧉ (Kloniraj)</B> pravi potpunu kopiju sa svim fazama i stavkama. Korisno kad novi projekat liči na postojeći.</P>
        <H3>Izvoz i uvoz (dijeljenje)</H3>
        <P>Dugme <B>📤 Izvezi projekat</B> čuva projekat kao fajl za slanje kolegi. Kolega ga učita preko <B>📥 Uvezi projekat</B>. Uvoz uvijek kreira <B>novi</B> projekat — nikad ne prepisuje postojeće.</P>
        <Info naslov="💡 Savjet">Ako preimenujete .json fajl prije slanja, uvezeni projekat će se pojaviti pod tim novim imenom.</Info>
      </>
    ),
    faze: (
      <>
        <H>5. Faze i grupe radova</H>
        <H3>Faze (struke)</H3>
        <P>Kliktanjem na fazu birate u kojoj radite. Dvoklik na naziv omogućava preimenovanje. Dugme <B>+ Nova faza (vlastita)</B> dodaje prilagođenu fazu.</P>
        <Info naslov="ℹ️ Vlastita faza i baza">U predefinisanim fazama pretraga prikazuje samo stavke relevantne za tu struku. U <B>vlastitoj fazi</B> imate pristup <B>cijeloj bazi</B> (svih 1.200+ stavki).</Info>
        <H3>Grupe radova</H3>
        <P>Unutar aktivne faze upišite naziv i kliknite <B>+ Dodaj</B>. Grupa radova je nosilac stavki i u izvozu postaje naslovljeni blok. Dvoklik na naziv grupe (u traci iznad tabele) omogućava preimenovanje.</P>
      </>
    ),
    stavke: (
      <>
        <H>6. Unos stavki (pozicija)</H>
        <P>Postoje <B>četiri načina</B> da dodate stavku. Možete ih kombinovati.</P>
        <H3>6.1 Iz baze pozicija</H3>
        <P>Iznad tabele je pretraga. Upišite pojam („beton", „malter", „iskop") ili izaberite kategoriju, pa kliknite na rezultat. Baza ima preko 1.200 detaljno opisanih pozicija.</P>
        <H3>6.2 Vlastita stavka</H3>
        <P>Dugme <B>+ Vlastita stavka</B> dodaje praznu stavku koju popunjavate ručno.</P>
        <H3>6.3 Moja baza</H3>
        <P>Stavke koje često koristite sačuvajte klikom na <B>⭐</B> — dostupne su u tabu „Moja baza" za buduće projekte.</P>
        <H3>6.4 AI asistent</H3>
        <P>Dugme <B>✨</B> generiše kompletne stavke na osnovu vašeg opisa (vidi poglavlje 8).</P>
        <H3>6.5 Podstavke</H3>
        <P>Dugme <B>+ pod</B> dodaje podstavku — za razbijanje pozicije po cjelinama (Prizemlje, Sprat 1…). Cijena se unosi na podstavke, a zbir se prikazuje na glavnoj stavci.</P>
        <H3>6.6 Uređivanje</H3>
        <Ul>
          <Li><B>Opis:</B> kliknite i kucajte; ćelija se širi. Ctrl+B podebljava tekst.</Li>
          <Li><B>Jedinica:</B> bira se iz menija; upisom „Obračun po m³" i sl. prilagodi se sama.</Li>
          <Li><B>Redoslijed:</B> prevucite za ručicu ⠿.</Li>
          <Li><B>🔁 Zamjena:</B> zamjenjuje stavku novom iz baze, zadržava mjesto.</Li>
          <Li><B>× Brisanje:</B> uz mogućnost „Opozovi".</Li>
          <Li><B>↩ Opozovi:</B> vraća posljednje izmjene polja.</Li>
        </Ul>
      </>
    ),
    uslovi: (
      <>
        <H>7. Opšti tehnički uslovi grupe radova</H>
        <P>Iznad tabele je sklopivi panel <B>„📋 Opšti tehnički uslovi grupe radova"</B>. Ovdje unosite uvodni tehnički tekst (obračun, kvalitet, uslovi izvođenja, normativi) koji se u Excel i PDF izvozu prikazuje prije stavki grupe.</P>
        <Ul>
          <Li><B>📥 Ubaci šablon za ovu grupu:</B> gotov, pripremljen tekst uslova (za 15 glavnih grupa: betonski, zidarski, izolaterski, fasaderski, molerski i druge).</Li>
          <Li><B>✨ AI predlog uslova:</B> jednim klikom AI asistent automatski predloži uslove za tu grupu radova; vi ih pregledate i primijenite (kao kod cijena).</Li>
          <Li>Tekst slobodno uređujete ili obrišete. Polje je opciono.</Li>
        </Ul>
        <Info naslov="💡 Zašto koristiti opšte tehničke uslove">Oni definišu šta jedinična cijena obuhvata i po kojim se pravilima vrši obračun — čime se štitite od nesporazuma sa izvođačem i dokument izgleda profesionalnije.</Info>
      </>
    ),
    ai: (
      <>
        <H>8. AI asistent</H>
        <P>AI asistent (dugme <B>✨</B> dolje desno) je pomoćnik koji razumije građevinski predmjer.</P>
        <H3>Šta može</H3>
        <Ul>
          <Li><B>Generisanje stavki</B> na osnovu vašeg opisa.</Li>
          <Li><B>Poboljšanje</B> postojećih opisa.</Li>
          <Li><B>Predlaganje proizvoda</B> poznatih proizvođača (Knauf, Weber, Mapei, Rockwool, Ytong…).</Li>
          <Li><B>Opšti tehnički uslovi</B> za grupu radova.</Li>
          <Li><B>Procjena cijena</B> — pojedinačno ili za cijeli projekat.</Li>
        </Ul>
        <H3>Procjena cijena — dva dugmeta</H3>
        <Ul>
          <Li><B>💶 Procijeni ovu fazu:</B> samo trenutnu grupu radova. Za svakodnevni rad.</Li>
          <Li><B>📊 Procijeni cijeli projekat:</B> sve faze. Za finalni prolaz pred predaju.</Li>
        </Ul>
        <P>Procjena se radi <B>u paketima</B>, uz prikaz napretka i mogućnost prekida. Za velike procjene prikazuje se <B>procjena troška</B> prije pokretanja.</P>
        <Info naslov="⚠️ Važno o AI cijenama" boja={ZLATNA}>AI cijene su <B>procjena tržišta, ne obavezujuća ponuda</B>. Odlične kao orijentacija, ali za konačan predračun provjerite sa aktuelnim stanjem. Sve cijene pregledate i prihvatate prije nego se upišu.</Info>
      </>
    ),
    cijene: (
      <>
        <H>9. Cijene, valute i korekcije</H>
        <H3>Valuta</H3>
        <P>U traci iznad tabele birate valutu (EUR, KM, RSD, USD). Promjena valute <B>preračunava</B> sve cijene po tekućem kursu. KM je fiksno vezana za euro.</P>
        <H3>Uvećanje i umanjenje</H3>
        <P>U panelu <B>„⚖️ Uvećanje / Umanjenje"</B> podešavate procente <B>po fazi</B> (ne globalno) — jer izvođači mogu imati različitu maržu ili popust. Uvećanje pokriva npr. PDV ili opšte troškove, umanjenje npr. popust. Prikazuju se u rekapitulaciji.</P>
      </>
    ),
    izvoz: (
      <>
        <H>10. Izvoz — Excel i PDF</H>
        <Ul>
          <Li><B>📊 Excel:</B> tabela sa formulama (zbirovi se računaju automatski). Birate izabranu fazu ili kompletan predmjer.</Li>
          <Li><B>🖨 Print/PDF:</B> pregled za štampu / snimanje u PDF.</Li>
        </Ul>
        <P>Oba sadrže zaglavlje sa podacima o projektu, stavke po grupama radova sa međuzbirovima, opšte tehničke uslove (ako su unijeti), i završnu <B>rekapitulaciju</B> sa sveukupnim iznosom.</P>
        <H3>Logo firme</H3>
        <P>Kroz <B>🏢 Firma</B> (gore desno) učitavate logo i naziv firme koji se pojavljuju u zaglavlju i podnožju dokumenata.</P>
      </>
    ),
    referenca: (
      <>
        <H>11. Brza referenca — sve opcije</H>
        <H3>Traka na vrhu</H3>
        <RefTabela redovi={[
          ['Naziv grupe', 'Dvoklik za preimenovanje aktivne grupe radova.'],
          ['↩ Opozovi', 'Vraća posljednje izmjene polja.'],
          ['Valuta', 'Mijenja valutu i preračunava cijene.'],
          ['📊 Excel', 'Izvoz — izabrana faza ili kompletan predmjer.'],
          ['🖨 Print/PDF', 'Pregled za štampu / PDF.'],
          ['📤 Izvezi projekat', 'Snima projekat kao fajl za kolegu.'],
        ]} />
        <H3>Lijevi panel</H3>
        <RefTabela redovi={[
          ['📁 Projekti', 'Izbor, kreiranje, kloniranje (⧉), brisanje (🗑), uvoz.'],
          ['📋 Podaci o projektu', 'Naziv, investitor, lokacija, datum.'],
          ['🏗️ Faza', 'Izbor struke; vlastita faza; preimenovanje (dvoklik).'],
          ['📦 Grupe radova', 'Izbor i dodavanje grupa radova.'],
          ['⚖️ Uvećanje / Umanjenje', 'Korekcije po fazi; pristup Mojoj bazi.'],
          ['📊 Rekapitulacija', 'Zbir aktivne grupe radova sa korekcijama.'],
        ]} />
        <H3>Red stavke</H3>
        <RefTabela redovi={[
          ['⠿', 'Ručica za prevlačenje — redoslijed stavki.'],
          ['+ pod', 'Dodaje podstavku.'],
          ['🔁', 'Zamjenjuje stavku novom iz baze.'],
          ['⭐', 'Čuva u „Moju bazu".'],
          ['×', 'Briše stavku (uz opoziv).'],
        ]} />
        <H3>Plutajuća dugmad</H3>
        <RefTabela redovi={[
          ['✨ (dolje desno)', 'Otvara AI asistenta.'],
          ['🏢 Firma (gore desno)', 'Logo i naziv firme.'],
        ]} />
      </>
    ),
    savjeti: (
      <>
        <H>12. Savjeti za efikasan rad</H>
        <Ul>
          <Li><B>Klonirajte slične projekte</B> umjesto unosa iznova.</Li>
          <Li><B>Gradite Moju bazu</B> — često korišćene stavke sačuvajte sa ⭐.</Li>
          <Li><B>Cijene ostavite za kraj</B> — unesite sve, pa AI-jem osvježite na tržište pred predaju.</Li>
          <Li><B>Koristite opšte tehničke uslove</B> — ubacite šablon za svaku grupu.</Li>
          <Li><B>Podstavke za etaže</B> kad se pozicija ponavlja po spratovima.</Li>
          <Li><B>Provjerite prije predaje</B> — AI cijene su orijentacija.</Li>
        </Ul>
        <Info naslov="Podrška" boja={ZLATNA}>Za dodatna pitanja ili prijedloge obratite se timu Kapitel d.o.o.</Info>
      </>
    ),
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 920, height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.3)' }}>
        {/* Zaglavlje */}
        <div style={{ background: TAMNO, color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📖 Uputstvo za korišćenje</div>
            <div style={{ fontSize: 11.5, opacity: 0.8 }}>Predmjer / Troškovnik</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            ✕ Zatvori
          </button>
        </div>

        {/* Tijelo: bočna navigacija + sadržaj */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Bočna navigacija */}
          <div style={{ width: 220, minWidth: 220, background: '#F5F6F8', borderRight: '1px solid #E5E2D8', overflowY: 'auto', padding: '10px 0' }}>
            {POGLAVLJA.map(p => (
              <div key={p.id} onClick={() => setAktivno(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13,
                  fontWeight: aktivno === p.id ? 700 : 400,
                  color: aktivno === p.id ? TAMNO : '#555',
                  background: aktivno === p.id ? '#E4E9EE' : 'transparent',
                  borderLeft: aktivno === p.id ? `3px solid ${TAMNO}` : '3px solid transparent' }}
                onMouseEnter={e => { if (aktivno !== p.id) e.currentTarget.style.background = '#ECEEF1' }}
                onMouseLeave={e => { if (aktivno !== p.id) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: 15 }}>{p.ikona}</span>
                <span>{p.naziv}</span>
              </div>
            ))}
          </div>

          {/* Sadržaj aktivnog poglavlja */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            {sadrzaj[aktivno]}
          </div>
        </div>
      </div>
    </div>
  )
}
