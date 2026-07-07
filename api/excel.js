import ExcelJS from 'exceljs'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { projekat, faze, svePozicije, valutaZnak='€', struke=[], filtrirajStruku=null } = req.body

    const calcSimple = p => (parseFloat(p.kolicina)||0)*(parseFloat(p.cijena)||0)
    const calcRow = (p, poz) => {
      const dj = poz.filter(d => d.parent_id === p.id)
      return dj.length > 0 ? dj.reduce((s,d) => s+calcSimple(d), 0) : calcSimple(p)
    }
    const fmtJmj = j => (j||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')
    const strip = s => (s||'').replace(/\*\*([^*]+)\*\*/g,'$1')
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

    const toRoman = n => {
      const vals = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
      let res = '', num = n
      for (const [v, s] of vals) { while (num >= v) { res += s; num -= v } }
      return res
    }

    // Format datuma DD.MM.YYYY - čuvamo kao tekst da Excel ne konvertuje
    const formatDatum = d => {
      if (!d) return ''
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [g, m, dd] = d.split('-')
        return `${dd}.${m}.${g}`
      }
      return d
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Predmjer/Troškovnik'
    const ws = wb.addWorksheet('Predmjer', {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'portrait',
        paperSize: 9,           // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,         // 0 = koliko god stranica po visini treba (ne stišći na 1 stranicu visine)
        scale: 83,
        horizontalCentered: false,
        verticalCentered: false,
        margins: {
          top: 0.5905511811023623, bottom: 0.5905511811023623,
          left: 0.984251968503937, right: 0.3937007874015748,
          header: 0.31496062992125984, footer: 0.31496062992125984,
        },
      },
    })

    // ── KOLONE: A-G (A je sad R.br., B je Šifra, ostalo nepromijenjeno) ──
    // Širine usklađene s ručno finaliziranom štampanom verzijom predmjera.
    ws.columns = [
      {width: 6.71},   // A - R.br.
      {width: 9.43},   // B - Šifra
      {width: 46.71},  // C - Opis pozicije
      {width: 4.86},   // D - J.mj.
      {width: 10.71},  // E - Jed. cijena
      {width: 13.86},  // F - Količina
      {width: 16.5},   // G - Ukupno (proširena za velike iznose s formatom valute, npr. milionske sume)
    ]

    const Z   = '1B2F43'
    const ZS  = 'EEF0F3'
    const SI  = 'F8F9FA'
    const SI2 = 'F9FAFB'
    const SI3 = 'F5F6F8'

    const fill = c => ({type:'pattern', pattern:'solid', fgColor:{argb:'FF'+c}})
    const font = (opts={}) => ({
      name: 'Calibri',
      bold:   opts.bold   || false,
      italic: opts.italic || false,
      size:   opts.size   || 10,
      color:  opts.color  ? {argb:'FF'+opts.color} : {argb:'FF000000'}
    })
    const al = (h, v, wrap) => ({ horizontal: h || 'left', vertical: v || 'top', wrapText: wrap !== false })
    const borderBottom = (style='thin', color='D8D5CC') => ({ bottom: {style, color:{argb:'FF'+color}} })
    const borderTopBottom = (topStyle, topColor, botStyle, botColor) => ({
      top:    {style:topStyle,  color:{argb:'FF'+topColor}},
      bottom: {style:botStyle||topStyle, color:{argb:'FF'+(botColor||topColor)}}
    })

    const CUR = String(valutaZnak).replace(/"/g, '')
    const FMT_CUR = `#,##0.00" ${CUR}";-#,##0.00" ${CUR}";"—"`
    const FMT_NUM = `#,##0.00;-#,##0.00;"—"`
    const FMT_QTY = `#,##0.00;-#,##0.00;"—"`

    let row

    // ── RED 1: NASLOV ──
    row = ws.addRow(['','PREDMJER I PREDRAČUN','','','','',''])
    ws.mergeCells(`A${row.number}:G${row.number}`)
    row.height = 21.95
    row.getCell('B').value = 'PREDMJER I PREDRAČUN'
    row.getCell('B').font  = font({bold:true, size:15, color:Z})
    row.getCell('B').alignment = al('center','center',false)

    // ── Podnaslov ako je export filtriran na jednu struku ──
    if (filtrirajStruku) {
      const nazivStruke = struke.find(s => s.kod === filtrirajStruku)?.naziv || ''
      const podNas = ws.addRow(['', `— ${nazivStruke} —`,'','','','',''])
      ws.mergeCells(`A${podNas.number}:G${podNas.number}`)
      podNas.height = 14
      podNas.getCell('B').font = font({size:10, color:'4A637C', italic:true})
      podNas.getCell('B').alignment = al('center','center',false)
    }

    // ── RED: Projekat / Investitor ──
    row = ws.addRow(['','Projekat:', projekat.naziv||'','','Investitor:', projekat.klijent||'',''])
    ws.mergeCells(`F${row.number}:G${row.number}`)
    row.height = 12.95
    row.getCell('B').font = font({size:9, color:'888888'})
    row.getCell('C').font = font({bold:true, size:9})
    row.getCell('E').font = font({size:9, color:'888888'})
    row.getCell('E').alignment = al('center','center',false)
    row.getCell('F').font = font({bold:true, size:9})
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // ── RED: Lokacija / Datum ──
    const datumTekst = formatDatum(projekat.datum)
    row = ws.addRow(['','Lokacija:', projekat.adresa||'','','Datum:', datumTekst,''])
    ws.mergeCells(`F${row.number}:G${row.number}`)
    row.height = 12.95
    row.getCell('B').font = font({size:9, color:'888888'})
    row.getCell('C').font = font({bold:true, size:9})
    row.getCell('E').font = font({size:9, color:'888888'})
    row.getCell('E').alignment = al('center','center',false)
    row.getCell('F').font = font({bold:true, size:9})
    row.getCell('F').numFmt = '@'
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // ── PRAZAN RED ──
    row = ws.addRow([])
    row.height = 8.1

    // Ukupno CIJELOG projekta (uvijek, bez obzira na filter — potrebno za rekapitulaciju na kraju)
    let grandTotalJS = 0
    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      grandTotalJS += poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
    }

    const fazePoStruci = {}
    for (const f of faze) {
      const kod = f.struka_kod || 'gradjevinski'
      if (!fazePoStruci[kod]) fazePoStruci[kod] = []
      fazePoStruci[kod].push(f)
    }

    // { naziv, addr (null ako nije detaljno prikazano), jsValue, rimski }
    const strukaTotalInfo = []

    let brStruke = 0
    for (const s of struke) {
      const fazeUStruci = fazePoStruci[s.kod] || []
      const imaSadrzaja = fazeUStruci.some(f => (svePozicije[f.id]||[]).length > 0)
      if (!imaSadrzaja) continue

      brStruke++
      const prikaziDetalj = !filtrirajStruku || filtrirajStruku === s.kod
      const strukaFazaGAddrs = []
      let strukaUkupnoJS = 0
      const grupaSubtotali = [] // zbirna rekapitulacija grupa radova (faza) unutar OVE struke

      if (prikaziDetalj) {
        // ── NASLOV STRUKE ──
        row = ws.addRow(['', `${toRoman(brStruke)}   ${s.naziv.toUpperCase()}`,'','','','',''])
        ws.mergeCells(`A${row.number}:G${row.number}`)
        row.height = 22
        row.getCell('B').font  = font({bold:true, size:13, color:'FFFFFF'})
        row.getCell('B').alignment = al('left','center',false)
        row.eachCell({includeEmpty:true}, c => { c.fill = fill(Z) })
      }

      for (const f of fazeUStruci) {
        const poz = svePozicije[f.id]||[]
        if (!poz.length) continue

        const djecaMap = {}
        for (const p of poz) {
          if (p.parent_id) {
            if (!djecaMap[p.parent_id]) djecaMap[p.parent_id]=[]
            djecaMap[p.parent_id].push(p)
          }
        }
        const roditelji = poz.filter(p=>!p.parent_id)
        const byK = {}
        for (const p of roditelji) {
          const k = p.kategorija||'Ostalo'
          if (!byK[k]) byK[k]=[]
          byK[k].push(p)
        }

        let topLevelGAddrs = []

        if (prikaziDetalj) {
          // ── NASLOV FAZE ──
          row = ws.addRow(['', f.naziv.toUpperCase(),'','','','',''])
          ws.mergeCells(`A${row.number}:G${row.number}`)
          row.height = 18
          row.getCell('B').value = f.naziv.toUpperCase()
          row.getCell('B').font  = font({bold:true, size:11, color:Z})
          row.getCell('B').alignment = al('left','center',false)
          row.getCell('B').border = borderBottom('medium', Z)
          row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

          // ── ZAGLAVLJE KOLONA ──
          row = ws.addRow(['R.br.','Šifra','Opis pozicije','J.mj.',`Jed. cijena (${CUR})`,'Količina',`Ukupno (${CUR})`])
          row.height = 27.95
          const thCols = ['A','B','C','D','E','F','G']
          const thAligns = ['center','center','left','center','center','center','center']
          thCols.forEach((col, i) => {
            const c = row.getCell(col)
            c.fill      = fill(Z)
            c.font      = font({bold:true, size:9, color:'FFFFFF'})
            c.alignment = al(thAligns[i], 'center', true)
            c.border    = borderBottom('medium', '145229')
          })
        }

        let rb=1; let par=0

        for (const [k, stavke] of Object.entries(byK)) {
          if (prikaziDetalj) {
            // ── KATEGORIJA ──
            row = ws.addRow(['', k.toUpperCase(),'','','','',''])
            ws.mergeCells(`A${row.number}:G${row.number}`)
            row.height = 14.1
            row.getCell('B').value = k.toUpperCase()
            row.getCell('B').fill  = fill(ZS)
            row.getCell('B').font  = font({bold:true, size:9, color:Z})
            row.getCell('B').alignment = al('left','center',false)
            row.getCell('B').border = borderBottom('thin','C8C5BD')
          }

          for (const p of stavke) {
            const djeca   = djecaMap[p.id]||[]
            const imadjece = djeca.length > 0

            if (!prikaziDetalj) { rb++; par++; continue }

            const ispar   = par%2===1
            const bg      = ispar ? SI : 'FFFFFF'
            const naziv   = strip(p.naziv||'')
            const visina  = Math.max(14, Math.min(150, Math.ceil(naziv.length/58)*12+4))

            // ── GLAVNA STAVKA ──
            row = ws.addRow(['','','','','','',''])
            row.height = visina
            const mainRowNum = row.number

            // R.br.
            row.getCell('A').value     = String(rb)
            row.getCell('A').fill      = fill(bg)
            row.getCell('A').font      = font({size:9, color:'666666'})
            row.getCell('A').alignment = al('center','top',false)
            row.getCell('A').border    = borderBottom('thin','EEECEA')

            // Šifra
            row.getCell('B').value     = p.sifra || ''
            row.getCell('B').numFmt    = '@'
            row.getCell('B').fill      = fill(bg)
            row.getCell('B').font      = font({size:8.5, color:'8A94A0'})
            row.getCell('B').alignment = al('center','top',false)
            row.getCell('B').border    = borderBottom('thin','EEECEA')

            row.getCell('C').value     = naziv
            row.getCell('C').fill      = fill(bg)
            row.getCell('C').font      = font({size:9.5, italic: imadjece})
            row.getCell('C').alignment = al('left','top',true)
            row.getCell('C').border    = borderBottom('thin','EEECEA')

            row.getCell('D').value     = fmtJmj(p.jedinica)
            row.getCell('D').fill      = fill(bg)
            row.getCell('D').font      = font({size:9, color:'555555'})
            row.getCell('D').alignment = al('center','center',false)
            row.getCell('D').border    = borderBottom('thin','EEECEA')

            if (imadjece) {
              row.getCell('E').value     = 'zbir'
              row.getCell('E').font      = font({size:9, italic:true, color:'888888'})
              row.getCell('E').alignment = al('center','center',false)

              row.getCell('F').value     = '—'
              row.getCell('F').font      = font({size:9, color:'999999'})
              row.getCell('F').alignment = al('center','center',false)
            } else {
              row.getCell('E').value     = num(p.cijena)
              row.getCell('E').numFmt    = FMT_NUM
              row.getCell('E').font      = font({size:9.5})
              row.getCell('E').alignment = al('center','center',false)

              row.getCell('F').value     = num(p.kolicina)
              row.getCell('F').numFmt    = FMT_QTY
              row.getCell('F').font      = font({size:9.5})
              row.getCell('F').alignment = al('center','center',false)
            }
            ;['E','F'].forEach(col => {
              row.getCell(col).fill   = fill(bg)
              row.getCell(col).border = borderBottom('thin','EEECEA')
            })

            row.getCell('G').fill      = fill(bg)
            row.getCell('G').border    = borderBottom('thin','EEECEA')
            row.getCell('G').numFmt    = FMT_CUR
            row.getCell('G').font      = font({bold:true, size:9.5, color:Z})
            row.getCell('G').alignment = al('center','center',false)

            if (!imadjece) {
              const jsVal = calcSimple(p)
              row.getCell('G').value = { formula: `E${mainRowNum}*F${mainRowNum}`, result: jsVal }
              topLevelGAddrs.push(`G${mainRowNum}`)
            }

            if (imadjece) {
              const childRowNums = []

              djeca.forEach((d, di) => {
                const dNaziv = strip(d.naziv||'')
                const dRow = ws.addRow(['','','','','','',''])
                dRow.height = Math.max(14, Math.ceil(dNaziv.length/58)*11+4)
                childRowNums.push(dRow.number)

                dRow.getCell('A').value     = `${rb}.${di+1}`
                dRow.getCell('A').numFmt    = '@'
                dRow.getCell('A').fill      = fill(SI2)
                dRow.getCell('A').font      = font({size:9, color:'AAAAAA'})
                dRow.getCell('A').alignment = al('center','top',false)
                dRow.getCell('A').border    = borderBottom('thin','EEECEA')

                dRow.getCell('B').fill      = fill(SI2)
                dRow.getCell('B').border    = borderBottom('thin','EEECEA')

                dRow.getCell('C').value     = dNaziv
                dRow.getCell('C').fill      = fill(SI2)
                dRow.getCell('C').font      = font({size:9, color:'444444'})
                dRow.getCell('C').alignment = al('left','top',true)
                dRow.getCell('C').border    = borderBottom('thin','EEECEA')

                dRow.getCell('D').value     = fmtJmj(d.jedinica)
                dRow.getCell('D').fill      = fill(SI2)
                dRow.getCell('D').font      = font({size:9, color:'555555'})
                dRow.getCell('D').alignment = al('center','center',false)
                dRow.getCell('D').border    = borderBottom('thin','EEECEA')

                dRow.getCell('E').value     = num(d.cijena)
                dRow.getCell('E').numFmt    = FMT_NUM
                dRow.getCell('E').fill      = fill(SI2)
                dRow.getCell('E').font      = font({size:9})
                dRow.getCell('E').alignment = al('center','center',false)
                dRow.getCell('E').border    = borderBottom('thin','EEECEA')

                dRow.getCell('F').value     = num(d.kolicina)
                dRow.getCell('F').numFmt    = FMT_QTY
                dRow.getCell('F').fill      = fill(SI2)
                dRow.getCell('F').font      = font({size:9})
                dRow.getCell('F').alignment = al('center','center',false)
                dRow.getCell('F').border    = borderBottom('thin','EEECEA')

                const jsDu = calcSimple(d)
                dRow.getCell('G').value     = { formula: `E${dRow.number}*F${dRow.number}`, result: jsDu }
                dRow.getCell('G').numFmt    = FMT_CUR
                dRow.getCell('G').fill      = fill(SI2)
                dRow.getCell('G').font      = font({size:9, color:'4A637C'})
                dRow.getCell('G').alignment = al('center','center',false)
                dRow.getCell('G').border    = borderBottom('thin','EEECEA')
              })

              const firstChild = childRowNums[0]
              const lastChild  = childRowNums[childRowNums.length - 1]
              const jsParentTotal = djeca.reduce((s,d)=>s+calcSimple(d),0)
              const parentGCell = ws.getRow(mainRowNum).getCell('G')
              parentGCell.value = { formula: `SUM(G${firstChild}:G${lastChild})`, result: jsParentTotal }
              topLevelGAddrs.push(`G${mainRowNum}`)

              const sumRow = ws.addRow(['','','','','','',''])
              ws.mergeCells(`C${sumRow.number}:F${sumRow.number}`)
              sumRow.height = 12.95

              sumRow.getCell('A').fill   = fill(SI3)
              sumRow.getCell('A').border = borderBottom('thin','D8D5CC')
              sumRow.getCell('B').fill   = fill(SI3)
              sumRow.getCell('B').border = borderBottom('thin','D8D5CC')

              const jmjTekst = fmtJmj(p.jedinica)
              const jsUkKol = djeca.reduce((s,d)=>s+(parseFloat(d.kolicina)||0),0)
              sumRow.getCell('C').value = {
                formula: `"Ukupno: "&TEXT(SUM(F${firstChild}:F${lastChild}),"0.00")&" ${jmjTekst}"`,
                result: `Ukupno: ${jsUkKol.toFixed(2)} ${jmjTekst}`
              }
              sumRow.getCell('C').fill      = fill(SI3)
              sumRow.getCell('C').font      = font({size:8.5, color:'666666', italic:true})
              sumRow.getCell('C').alignment = al('left','center',false)
              sumRow.getCell('C').border    = borderBottom('thin','D8D5CC')

              sumRow.getCell('G').value     = { formula: `G${mainRowNum}`, result: jsParentTotal }
              sumRow.getCell('G').numFmt    = FMT_CUR
              sumRow.getCell('G').fill      = fill(SI3)
              sumRow.getCell('G').font      = font({bold:true, size:9, color:Z})
              sumRow.getCell('G').alignment = al('center','center',false)
              sumRow.getCell('G').border    = {
                top:    {style:'medium', color:{argb:'FF'+Z}},
                bottom: {style:'thin',   color:{argb:'FFD8D5CC'}}
              }
            }
            rb++
            par++
          }
        }

        const jsFazaTotal = roditelji.reduce((s,p)=>s+calcRow(p,poz),0)
        grupaSubtotali.push({ naziv: f.naziv, ukupno: jsFazaTotal })

        if (prikaziDetalj) {
          const totRow = ws.addRow(['','','','','','',''])
          ws.mergeCells(`A${totRow.number}:F${totRow.number}`)
          totRow.height = 15.95

          totRow.getCell('B').value     = `UKUPNO ${f.naziv.toUpperCase()}:`
          totRow.getCell('B').alignment = al('right','center',false)
          ;['A','B','C','D','E','F','G'].forEach(col => {
            totRow.getCell(col).fill   = fill(ZS)
            totRow.getCell(col).font   = font({bold:true, size:10})
            totRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
          })
          totRow.getCell('G').value = {
            formula: topLevelGAddrs.length > 0 ? `SUM(${topLevelGAddrs.join(',')})` : '0',
            result: jsFazaTotal
          }
          totRow.getCell('G').numFmt    = FMT_CUR
          totRow.getCell('G').font      = font({bold:true, size:10, color:Z})
          totRow.getCell('G').alignment = al('center','center',false)

          strukaFazaGAddrs.push(`G${totRow.number}`)

          const prazan = ws.addRow([])
          prazan.height = 8.1
        }
        strukaUkupnoJS += jsFazaTotal
      }

      if (prikaziDetalj) {
        // ── Zbirna rekapitulacija grupa radova unutar ove struke (ako ih ima više od jedne) ──
        if (grupaSubtotali.length > 1) {
          const zbRekNas = ws.addRow(['', `ZBIRNA REKAPITULACIJA — ${s.naziv.toUpperCase()}`,'','','','',''])
          ws.mergeCells(`A${zbRekNas.number}:G${zbRekNas.number}`)
          zbRekNas.height = 16
          zbRekNas.getCell('B').font   = font({bold:true, size:10, color:Z})
          zbRekNas.getCell('B').border = borderBottom('thin', '4A637C')
          zbRekNas.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

          for (const g of grupaSubtotali) {
            const gRow = ws.addRow(['', g.naziv,'','','','',''])
            ws.mergeCells(`A${gRow.number}:F${gRow.number}`)
            gRow.height = 13.5
            gRow.getCell('B').font   = font({size:9.5})
            gRow.getCell('B').border = borderBottom('thin','EEECEA')
            gRow.getCell('G').value  = g.ukupno
            gRow.getCell('G').numFmt = FMT_CUR
            gRow.getCell('G').font   = font({size:9.5, color:Z})
            gRow.getCell('G').alignment = al('center','center',false)
            gRow.getCell('G').border    = borderBottom('thin','EEECEA')
          }
          const prazan2 = ws.addRow([])
          prazan2.height = 8
        }

        // ── UKUPNO STRUKA ──
        const strukaTotRow = ws.addRow(['','','','','','',''])
        ws.mergeCells(`A${strukaTotRow.number}:F${strukaTotRow.number}`)
        strukaTotRow.height = 17
        strukaTotRow.getCell('B').value     = `UKUPNO ${toRoman(brStruke)} — ${s.naziv.toUpperCase()}:`
        strukaTotRow.getCell('B').alignment = al('right','center',false)
        ;['A','B','C','D','E','F','G'].forEach(col => {
          strukaTotRow.getCell(col).fill   = fill('E8ECF0')
          strukaTotRow.getCell(col).font   = font({bold:true, size:11, color:Z})
          strukaTotRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
        })
        strukaTotRow.getCell('G').value = {
          formula: strukaFazaGAddrs.length > 0 ? `SUM(${strukaFazaGAddrs.join(',')})` : '0',
          result: strukaUkupnoJS
        }
        strukaTotRow.getCell('G').numFmt    = FMT_CUR
        strukaTotRow.getCell('G').alignment = al('center','center',false)

        const strukaMedjuzbirAddr = `G${strukaTotRow.number}`
        let strukaUvecAddr = null
        let strukaUmanAddr = null

        // ── Uvećanje/umanjenje se podešava PO STRUCI (svaki izvođač može imati
        // drugačiju maržu/popust), ne globalno za cijeli projekat. ──
        const strukaUvecPct = s.uvecanjePct || 0
        const strukaUmanPct = s.umanjenjePct || 0

        if (strukaUvecPct > 0) {
          const suvRow = ws.addRow(['','','','','',`+ Uvećanje (${strukaUvecPct}%):`,''])
          ws.mergeCells(`A${suvRow.number}:E${suvRow.number}`)
          suvRow.height = 13.5
          suvRow.getCell('F').font      = font({size:9.5, color:Z})
          suvRow.getCell('F').alignment = al('center','center',false)
          suvRow.getCell('G').value     = { formula: `${strukaMedjuzbirAddr}*${strukaUvecPct}/100`, result: strukaUkupnoJS*strukaUvecPct/100 }
          suvRow.getCell('G').numFmt    = FMT_CUR
          suvRow.getCell('G').font      = font({size:9.5, color:Z})
          suvRow.getCell('G').alignment = al('center','center',false)
          strukaUvecAddr = `G${suvRow.number}`
        }

        if (strukaUmanPct > 0) {
          const sumRow2 = ws.addRow(['','','','','',`− Umanjenje (${strukaUmanPct}%):`,''])
          ws.mergeCells(`A${sumRow2.number}:E${sumRow2.number}`)
          sumRow2.height = 13.5
          sumRow2.getCell('F').font      = font({size:9.5, color:'C0392B'})
          sumRow2.getCell('F').alignment = al('center','center',false)
          sumRow2.getCell('G').value     = { formula: `${strukaMedjuzbirAddr}*${strukaUmanPct}/100`, result: strukaUkupnoJS*strukaUmanPct/100 }
          sumRow2.getCell('G').numFmt    = FMT_CUR
          sumRow2.getCell('G').font      = font({size:9.5, color:'C0392B'})
          sumRow2.getCell('G').alignment = al('center','center',false)
          strukaUmanAddr = `G${sumRow2.number}`
        }

        // jsStrukaSveukupno se računa uvijek (i kad nema korekcije, jednako je strukaUkupnoJS) —
        // koristi se niže za agregaciju u globalnu rekapitulaciju.
        const jsStrukaSveukupno = strukaUkupnoJS
          + (strukaUvecPct>0 ? strukaUkupnoJS*strukaUvecPct/100 : 0)
          - (strukaUmanPct>0 ? strukaUkupnoJS*strukaUmanPct/100 : 0)

        if (strukaUvecPct > 0 || strukaUmanPct > 0) {
          let strukaSveukupnoFormula = strukaMedjuzbirAddr
          if (strukaUvecAddr) strukaSveukupnoFormula += `+${strukaUvecAddr}`
          if (strukaUmanAddr) strukaSveukupnoFormula += `-${strukaUmanAddr}`

          const ssvRow = ws.addRow(['','','','','',`SVEUKUPNO ${toRoman(brStruke)}:`,''])
          ws.mergeCells(`A${ssvRow.number}:E${ssvRow.number}`)
          ssvRow.height = 15.95
          ;['A','B','C','D','E','F','G'].forEach(col => {
            ssvRow.getCell(col).fill   = fill('E8ECF0')
            ssvRow.getCell(col).font   = font({bold:true, size:10.5, color:Z})
            ssvRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
          })
          ssvRow.getCell('F').alignment = al('center','center',false)
          ssvRow.getCell('G').value     = { formula: strukaSveukupnoFormula, result: jsStrukaSveukupno }
          ssvRow.getCell('G').numFmt    = FMT_CUR
          ssvRow.getCell('G').alignment = al('center','center',false)

          // Globalna rekapitulacija sad koristi VEĆ KORIGOVANU vrijednost ove struke
          // (jsStrukaSveukupno) — korekcija (uvećanje/umanjenje) se od sada primjenjuje
          // isključivo na nivou pojedinačne struke, ne dodatno globalno na cijeli projekat.
          // Time se izbjegava da korisnik vidi npr. "970,08 + 10% = 1.067,09" po struci,
          // a onda opet "970,08 (nekorigovano) + 10%" u globalnoj rekapitulaciji.
          strukaTotalInfo.push({ naziv: s.naziv, addr: `G${ssvRow.number}`, jsValue: jsStrukaSveukupno, rimski: toRoman(brStruke) })
        } else {
          strukaTotalInfo.push({ naziv: s.naziv, addr: strukaMedjuzbirAddr, jsValue: jsStrukaSveukupno, rimski: toRoman(brStruke) })
        }

        const prazanStruka = ws.addRow([])
        prazanStruka.height = 10
      } else {
        // Struka nije detaljno prikazana (filtrirana) — nema ćelije za referencirati.
        // Izračunaj korigovanu vrijednost i ovdje (petlja za prazan/filtriran slučaj nema
        // pristup jsStrukaSveukupno definisanom gore jer je taj blok unutar prikaziDetalj).
        const skrivenaUvecPct = s.uvecanjePct || 0
        const skrivenaUmanPct = s.umanjenjePct || 0
        const jsSkrivenaSveukupno = strukaUkupnoJS
          + (skrivenaUvecPct>0 ? strukaUkupnoJS*skrivenaUvecPct/100 : 0)
          - (skrivenaUmanPct>0 ? strukaUkupnoJS*skrivenaUmanPct/100 : 0)
        strukaTotalInfo.push({ naziv: s.naziv, addr: null, jsValue: jsSkrivenaSveukupno, rimski: toRoman(brStruke) })
      }
    }

    // ── REKAPITULACIJA — samo za kompletan export ili Građevinsko-zanatski (glavni dokument projekta).
    // Ostale pojedinačne faze su samostalni dokumenti za tog izvođača, ne otkrivaju cijene drugih struka.
    const prikaziGlobalnuRekapitulaciju = !filtrirajStruku || filtrirajStruku === 'gradjevinski'
    if (prikaziGlobalnuRekapitulaciju) {
    const rekNas = ws.addRow(['','REKAPITULACIJA','','','','',''])
    ws.mergeCells(`A${rekNas.number}:G${rekNas.number}`)
    rekNas.height = 18
    rekNas.getCell('B').value     = 'REKAPITULACIJA'
    rekNas.getCell('B').font      = font({bold:true, size:11, color:Z})
    rekNas.getCell('B').alignment = al('left','center',false)
    rekNas.getCell('B').border    = borderBottom('medium', Z)
    rekNas.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    const rekHdr = ws.addRow(['','Faza','','','','',`Ukupno (${CUR})`])
    ws.mergeCells(`A${rekHdr.number}:F${rekHdr.number}`)
    rekHdr.height = 14.1
    ;['A','B','C','D','E','F','G'].forEach(col => {
      rekHdr.getCell(col).fill      = fill(Z)
      rekHdr.getCell(col).font      = font({bold:true, size:9, color:'FFFFFF'})
      rekHdr.getCell(col).alignment = al('left','center',false)
    })
    rekHdr.getCell('G').alignment = al('center','center',false)

    const rekapGAddrs = []
    for (const info of strukaTotalInfo) {
      const fRow = ws.addRow(['', `${info.rimski}   ${info.naziv}`,'','','','',''])
      ws.mergeCells(`A${fRow.number}:F${fRow.number}`)
      fRow.height = 14.1
      fRow.getCell('B').font      = font({size:10})
      fRow.getCell('B').border    = borderBottom('thin','EEECEA')
      if (info.addr) {
        fRow.getCell('G').value = { formula: info.addr, result: info.jsValue }
      } else {
        fRow.getCell('G').value = info.jsValue
      }
      fRow.getCell('G').numFmt    = FMT_CUR
      fRow.getCell('G').font      = font({bold:true, color:Z})
      fRow.getCell('G').alignment = al('center','center',false)
      fRow.getCell('G').border    = borderBottom('thin','EEECEA')
      rekapGAddrs.push(`G${fRow.number}`)
    }

    // ── SVEUKUPNO — prost zbir već korigovanih iznosa po struci. Svaka struka je
    // obračunata sa svojim vlastitim uvećanjem/umanjenjem (vidi petlju iznad), pa se
    // ovdje ništa dodatno ne primjenjuje — time se izbjegava dvostruko računanje
    // korekcije (jednom po struci, pa opet globalno na cijeli projekat). ──
    const imaBiloKakvuKorekciju = struke.some(s => (s.uvecanjePct||0) > 0 || (s.umanjenjePct||0) > 0)

    if (imaBiloKakvuKorekciju) {
      const napRow = ws.addRow(['','','','','','',''])
      ws.mergeCells(`A${napRow.number}:G${napRow.number}`)
      napRow.height = 11
      napRow.getCell('B').value     = '* iznosi po struci već uključuju eventualno uvećanje/umanjenje te struke'
      napRow.getCell('B').font      = font({size:7.5, italic:true, color:'999999'})
      napRow.getCell('B').alignment = al('left','center',false)
      napRow.eachCell({includeEmpty:true}, c => { if (!c.fill) c.fill = fill('FFFFFF') })
    }

    const svRow = ws.addRow(['','','','','','SVEUKUPNO:',''])
    ws.mergeCells(`A${svRow.number}:E${svRow.number}`)
    svRow.height = 18
    ;['A','B','C','D','E','F','G'].forEach(col => {
      svRow.getCell(col).fill   = fill('E8ECF0')
      svRow.getCell(col).font   = font({bold:true, size:12, color:Z})
      svRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
    })
    svRow.getCell('F').alignment = al('center','center',false)
    svRow.getCell('G').value     = {
      formula: rekapGAddrs.length > 0 ? `SUM(${rekapGAddrs.join(',')})` : '0',
      result: strukaTotalInfo.reduce((s, x) => s + x.jsValue, 0)
    }
    svRow.getCell('G').numFmt    = FMT_CUR
    svRow.getCell('G').alignment = al('center','center',false)
    } // kraj prikaziGlobalnuRekapitulaciju bloka

    // ── SLANJE FAJLA ──
    const buffer = await wb.xlsx.writeBuffer()
    const ime = (projekat.naziv||'Predmjer').replace(/[^a-zA-Z0-9_]/g,'_')
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${ime}.xlsx"`)
    res.send(Buffer.from(buffer))

  } catch(err) {
    console.error('Excel API greška:', err.stack||err.message)
    res.status(500).json({ error: err.message })
  }
}
