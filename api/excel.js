import ExcelJS from 'exceljs'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { projekat, faze, svePozicije, uvR=0, uvM=0, umR=0, umM=0, valutaZnak='€' } = req.body

    const calcSimple = p => (parseFloat(p.kolicina)||0)*(parseFloat(p.cijena)||0)*(1-(parseFloat(p.rabat)||0)/100)
    const calcRow = (p, poz) => {
      const dj = poz.filter(d => d.parent_id === p.id)
      return dj.length > 0 ? dj.reduce((s,d) => s+calcSimple(d), 0) : calcSimple(p)
    }
    const fmtJmj = j => (j||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')
    const strip = s => (s||'').replace(/\*\*([^*]+)\*\*/g,'$1')
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

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
    const ws = wb.addWorksheet('Predmjer', { views:[{showGridLines:false}] })

    // ── KOLONE: B-H (kao u referentnom fajlu) ──
    ws.columns = [
      {width: 2.5},    // A - spacer
      {width: 8.0},    // B - R.br.
      {width: 51.14},  // C - Opis pozicije
      {width: 4.86},   // D - J.mj.
      {width: 10.71},  // E - Jed. cijena
      {width: 8.86},   // F - Količina
      {width: 14.0},   // G - Rabat
      {width: 8.86},   // H - Ukupno
    ]

    const Z   = '1B4332'
    const ZS  = 'EEF3F1'
    const SI  = 'F8FAF8'
    const SI2 = 'FAFAF8'
    const SI3 = 'F5F8F6'

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

    // Dinamički format broja sa izabranom valutom - 3 sekcije: pozitivno;negativno;nula(prikaži crticu)
    const CUR = String(valutaZnak).replace(/"/g, '')
    const FMT_CUR = `#,##0.00" ${CUR}";-#,##0.00" ${CUR}";"—"`
    const FMT_NUM = `#,##0.00;-#,##0.00;"—"`
    const FMT_QTY = `#,##0.##;-#,##0.##;"—"`
    const FMT_PCT = `0.0"%";-0.0"%";"—"`

    let row

    // ── RED 1: NASLOV ──
    row = ws.addRow(['','PREDMJER I PREDRAČUN','','','','','',''])
    ws.mergeCells(`B${row.number}:H${row.number}`)
    row.height = 21.95
    row.getCell('B').value = 'PREDMJER I PREDRAČUN'
    row.getCell('B').font  = font({bold:true, size:15, color:Z})
    row.getCell('B').alignment = al('center','center',false)

    // ── RED 2: Projekat / Investitor ──
    row = ws.addRow(['','Projekat:', projekat.naziv||'','','','Investitor:', projekat.klijent||'',''])
    ws.mergeCells(`C${row.number}:D${row.number}`)
    ws.mergeCells(`G${row.number}:H${row.number}`)
    row.height = 12.95
    row.getCell('B').font = font({size:9, color:'888888'})
    row.getCell('C').font = font({bold:true, size:9})
    row.getCell('F').font = font({size:9, color:'888888'})
    row.getCell('F').alignment = al('center','center',false)
    row.getCell('G').font = font({bold:true, size:9})
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // ── RED 3: Lokacija / Datum ──
    const datumTekst = formatDatum(projekat.datum)
    row = ws.addRow(['','Lokacija:', projekat.adresa||'','','','Datum:', datumTekst,''])
    ws.mergeCells(`C${row.number}:D${row.number}`)
    ws.mergeCells(`G${row.number}:H${row.number}`)
    row.height = 12.95
    row.getCell('B').font = font({size:9, color:'888888'})
    row.getCell('C').font = font({bold:true, size:9})
    row.getCell('F').font = font({size:9, color:'888888'})
    row.getCell('F').alignment = al('center','center',false)
    row.getCell('G').font = font({bold:true, size:9})
    row.getCell('G').numFmt = '@'
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // ── PRAZAN RED ──
    row = ws.addRow([])
    row.height = 8.1

    // Rezultati potrebni za 'result' keš formula (prikaz prije prvog Excel recalculate-a)
    let grandTotalJS = 0
    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      grandTotalJS += poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
    }

    // Adrese H-ćelija "UKUPNO FAZA" po fazi, za rekapitulaciju
    const fazaTotalInfo = [] // { naziv, addr, jsValue }

    // ── FAZE ──
    for (const f of faze) {
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

      // ── NASLOV FAZE ──
      row = ws.addRow(['', f.naziv.toUpperCase(),'','','','','',''])
      ws.mergeCells(`B${row.number}:H${row.number}`)
      row.height = 18
      row.getCell('B').value = f.naziv.toUpperCase()
      row.getCell('B').font  = font({bold:true, size:11, color:Z})
      row.getCell('B').alignment = al('left','center',false)
      row.getCell('B').border = borderBottom('medium', Z)
      row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

      // ── ZAGLAVLJE KOLONA ──
      row = ws.addRow(['','R.br.','Opis pozicije','J.mj.',`Jed. cijena (${CUR})`,'Količina','Rabat',`Ukupno (${CUR})`])
      row.height = 27.95
      const thCols = ['B','C','D','E','F','G','H']
      const thAligns = ['center','left','center','center','center','center','center']
      thCols.forEach((col, i) => {
        const c = row.getCell(col)
        c.fill      = fill(Z)
        c.font      = font({bold:true, size:9, color:'FFFFFF'})
        c.alignment = al(thAligns[i], 'center', true)
        c.border    = borderBottom('medium', '145229')
      })

      let rb=1; let par=0
      const topLevelHAddrs = [] // H-ćelije svih glavnih (roditelj) stavki u ovoj fazi

      for (const [k, stavke] of Object.entries(byK)) {
        // ── KATEGORIJA ──
        row = ws.addRow(['', k.toUpperCase(),'','','','','',''])
        ws.mergeCells(`B${row.number}:H${row.number}`)
        row.height = 14.1
        row.getCell('B').value = k.toUpperCase()
        row.getCell('B').fill  = fill(ZS)
        row.getCell('B').font  = font({bold:true, size:9, color:Z})
        row.getCell('B').alignment = al('left','center',false)
        row.getCell('B').border = borderBottom('thin','C8C5BD')

        for (const p of stavke) {
          const djeca   = djecaMap[p.id]||[]
          const imadjece = djeca.length > 0
          const ispar   = par%2===1
          const bg      = ispar ? SI : 'FFFFFF'
          const naziv   = strip(p.naziv||'')
          const visina  = Math.max(14, Math.min(150, Math.ceil(naziv.length/52)*12+4))

          // ── GLAVNA STAVKA ──
          row = ws.addRow(['','','','','','','',''])
          row.height = visina
          const mainRowNum = row.number

          // R.br.
          row.getCell('B').value     = String(rb)
          row.getCell('B').fill      = fill(bg)
          row.getCell('B').font      = font({size:9, color:'666666'})
          row.getCell('B').alignment = al('center','top',false)
          row.getCell('B').border    = borderBottom('thin','EEECEA')

          // Opis
          row.getCell('C').value     = naziv
          row.getCell('C').fill      = fill(bg)
          row.getCell('C').font      = font({size:9.5, italic: imadjece})
          row.getCell('C').alignment = al('left','top',true)
          row.getCell('C').border    = borderBottom('thin','EEECEA')

          // J.mj.
          row.getCell('D').value     = fmtJmj(p.jedinica)
          row.getCell('D').fill      = fill(bg)
          row.getCell('D').font      = font({size:9, color:'555555'})
          row.getCell('D').alignment = al('center','center',false)
          row.getCell('D').border    = borderBottom('thin','EEECEA')

          if (imadjece) {
            // Roditelj sa podstavkama - E/F/G su labele, ne brojevi
            row.getCell('E').value     = 'zbir'
            row.getCell('E').font      = font({size:9, italic:true, color:'888888'})
            row.getCell('E').alignment = al('center','center',false)

            row.getCell('F').value     = '—'
            row.getCell('F').font      = font({size:9, color:'999999'})
            row.getCell('F').alignment = al('center','center',false)

            row.getCell('G').value     = '—'
            row.getCell('G').font      = font({size:9, color:'999999'})
            row.getCell('G').alignment = al('center','center',false)
          } else {
            // Obična stavka - E/F/G su pravi brojevi (default 0), formule će raditi
            row.getCell('E').value     = num(p.cijena)
            row.getCell('E').numFmt    = FMT_NUM
            row.getCell('E').font      = font({size:9.5})
            row.getCell('E').alignment = al('center','center',false)

            row.getCell('F').value     = num(p.kolicina)
            row.getCell('F').numFmt    = FMT_QTY
            row.getCell('F').font      = font({size:9.5})
            row.getCell('F').alignment = al('center','center',false)

            row.getCell('G').value     = num(p.rabat)
            row.getCell('G').numFmt    = FMT_PCT
            row.getCell('G').font      = font({size:9})
            row.getCell('G').alignment = al('center','center',false)
          }
          ;['E','F','G'].forEach(col => {
            row.getCell(col).fill   = fill(bg)
            row.getCell(col).border = borderBottom('thin','EEECEA')
          })

          // Ukupno (H) — formula, popunjava se odmah za obične stavke,
          // a za stavke sa podstavkama se popunjava NAKON upisa djece (treba raspon redova)
          row.getCell('H').fill      = fill(bg)
          row.getCell('H').border    = borderBottom('thin','EEECEA')
          row.getCell('H').numFmt    = FMT_CUR
          row.getCell('H').font      = font({bold:true, size:9.5, color:Z})
          row.getCell('H').alignment = al('center','center',false)

          if (!imadjece) {
            const jsVal = calcSimple(p)
            row.getCell('H').value = { formula: `E${mainRowNum}*F${mainRowNum}*(1-G${mainRowNum}/100)`, result: jsVal }
            topLevelHAddrs.push(`H${mainRowNum}`)
          }

          // ── PODSTAVKE ──
          if (imadjece) {
            const childRowNums = []

            djeca.forEach((d, di) => {
              const dNaziv = strip(d.naziv||'')
              const dRow = ws.addRow(['','','','','','','',''])
              dRow.height = Math.max(14, Math.ceil(dNaziv.length/52)*11+4)
              childRowNums.push(dRow.number)

              dRow.getCell('B').value     = `${rb}.${di+1}`
              dRow.getCell('B').numFmt    = '@'
              dRow.getCell('B').fill      = fill(SI2)
              dRow.getCell('B').font      = font({size:9, color:'AAAAAA'})
              dRow.getCell('B').alignment = al('center','top',false)
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

              // Pravi brojevi - editabilni, formule rade
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

              dRow.getCell('G').value     = num(d.rabat)
              dRow.getCell('G').numFmt    = FMT_PCT
              dRow.getCell('G').fill      = fill(SI2)
              dRow.getCell('G').font      = font({size:9})
              dRow.getCell('G').alignment = al('center','center',false)
              dRow.getCell('G').border    = borderBottom('thin','EEECEA')

              // Ukupno podstavke — živa formula
              const jsDu = calcSimple(d)
              dRow.getCell('H').value     = { formula: `E${dRow.number}*F${dRow.number}*(1-G${dRow.number}/100)`, result: jsDu }
              dRow.getCell('H').numFmt    = FMT_CUR
              dRow.getCell('H').fill      = fill(SI2)
              dRow.getCell('H').font      = font({size:9, color:'4A7C65'})
              dRow.getCell('H').alignment = al('center','center',false)
              dRow.getCell('H').border    = borderBottom('thin','EEECEA')
            })

            // Popuni H roditelja formulom SUM djece (raspon je kontinuiran)
            const firstChild = childRowNums[0]
            const lastChild  = childRowNums[childRowNums.length - 1]
            const jsParentTotal = djeca.reduce((s,d)=>s+calcSimple(d),0)
            const parentHCell = ws.getRow(mainRowNum).getCell('H')
            parentHCell.value = { formula: `SUM(H${firstChild}:H${lastChild})`, result: jsParentTotal }
            topLevelHAddrs.push(`H${mainRowNum}`)

            // ── RED "Ukupno: X.XX jed." — živa formula (SUM količina djece) ──
            const sumRow = ws.addRow(['','','','','','','',''])
            ws.mergeCells(`C${sumRow.number}:G${sumRow.number}`)
            sumRow.height = 12.95

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

            sumRow.getCell('H').value     = { formula: `H${mainRowNum}`, result: jsParentTotal }
            sumRow.getCell('H').numFmt    = FMT_CUR
            sumRow.getCell('H').fill      = fill(SI3)
            sumRow.getCell('H').font      = font({bold:true, size:9, color:Z})
            sumRow.getCell('H').alignment = al('center','center',false)
            sumRow.getCell('H').border    = {
              top:    {style:'medium', color:{argb:'FF'+Z}},
              bottom: {style:'thin',   color:{argb:'FFD8D5CC'}}
            }
          }
          rb++
          par++
        }
      }

      // ── UKUPNO FAZA — formula: SUM svih glavnih H-ćelija (mogu biti nekontinuirane) ──
      const jsFazaTotal = roditelji.reduce((s,p)=>s+calcRow(p,poz),0)
      const totRow = ws.addRow(['','','','','','','',''])
      ws.mergeCells(`B${totRow.number}:G${totRow.number}`)
      totRow.height = 15.95

      totRow.getCell('B').value     = `UKUPNO ${f.naziv.toUpperCase()}:`
      totRow.getCell('B').alignment = al('right','center',false)
      ;['B','C','D','E','F','G','H'].forEach(col => {
        totRow.getCell(col).fill   = fill(ZS)
        totRow.getCell(col).font   = font({bold:true, size:10})
        totRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
      })
      totRow.getCell('H').value = {
        formula: topLevelHAddrs.length > 0 ? `SUM(${topLevelHAddrs.join(',')})` : '0',
        result: jsFazaTotal
      }
      totRow.getCell('H').numFmt    = FMT_CUR
      totRow.getCell('H').font      = font({bold:true, size:10, color:Z})
      totRow.getCell('H').alignment = al('center','center',false)

      fazaTotalInfo.push({ naziv: f.naziv, addr: `H${totRow.number}`, jsValue: jsFazaTotal })

      // Prazan red između faza
      const prazan = ws.addRow([])
      prazan.height = 8.1
    }

    // ── REKAPITULACIJA ──
    const rekNas = ws.addRow(['','REKAPITULACIJA','','','','','',''])
    ws.mergeCells(`B${rekNas.number}:H${rekNas.number}`)
    rekNas.height = 18
    rekNas.getCell('B').value     = 'REKAPITULACIJA'
    rekNas.getCell('B').font      = font({bold:true, size:11, color:Z})
    rekNas.getCell('B').alignment = al('left','center',false)
    rekNas.getCell('B').border    = borderBottom('medium', Z)
    rekNas.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    const rekHdr = ws.addRow(['','Faza','','','','','',`Ukupno (${CUR})`])
    ws.mergeCells(`B${rekHdr.number}:G${rekHdr.number}`)
    rekHdr.height = 14.1
    ;['B','C','D','E','F','G','H'].forEach(col => {
      rekHdr.getCell(col).fill      = fill(Z)
      rekHdr.getCell(col).font      = font({bold:true, size:9, color:'FFFFFF'})
      rekHdr.getCell(col).alignment = al('left','center',false)
    })
    rekHdr.getCell('H').alignment = al('center','center',false)

    // Redovi faza u rekapitulaciji — H referencira "UKUPNO FAZA" ćeliju (živo)
    const rekapHAddrs = []
    for (const info of fazaTotalInfo) {
      const fRow = ws.addRow(['', info.naziv,'','','','','',''])
      ws.mergeCells(`B${fRow.number}:G${fRow.number}`)
      fRow.height = 14.1
      fRow.getCell('B').font      = font({size:10})
      fRow.getCell('B').border    = borderBottom('thin','EEECEA')
      fRow.getCell('H').value     = { formula: info.addr, result: info.jsValue }
      fRow.getCell('H').numFmt    = FMT_CUR
      fRow.getCell('H').font      = font({bold:true, color:Z})
      fRow.getCell('H').alignment = al('center','center',false)
      fRow.getCell('H').border    = borderBottom('thin','EEECEA')
      rekapHAddrs.push(`H${fRow.number}`)
    }

    // Međuzbir — SUM svih rekap redova (živo)
    const mbRow = ws.addRow(['','','','','','','Međuzbir:',''])
    ws.mergeCells(`B${mbRow.number}:F${mbRow.number}`)
    mbRow.height = 14.1
    ;['B','C','D','E','F','G','H'].forEach(col => {
      mbRow.getCell(col).fill   = fill(ZS)
      mbRow.getCell(col).font   = font({bold:true, size:10})
      mbRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
    })
    mbRow.getCell('G').alignment = al('center','center',false)
    mbRow.getCell('H').value = {
      formula: rekapHAddrs.length > 0 ? `SUM(${rekapHAddrs.join(',')})` : '0',
      result: grandTotalJS
    }
    mbRow.getCell('H').numFmt    = FMT_CUR
    mbRow.getCell('H').font      = font({bold:true, size:10, color:Z})
    mbRow.getCell('H').alignment = al('center','center',false)
    const medjuzbirAddr = `H${mbRow.number}`

    // Uvećanje/Umanjenje — formula: Međuzbir * procenat/100 (živo prati Međuzbir)
    const uvecPct = uvR + uvM
    const umanPct = umR + umM
    let uvecAddr = null
    let umanAddr = null

    if (uvecPct > 0) {
      const uvRow = ws.addRow(['','','','','','',`+ Uvećanje (${uvecPct}%):`,''])
      ws.mergeCells(`B${uvRow.number}:F${uvRow.number}`)
      uvRow.height = 14.1
      uvRow.getCell('G').font      = font({size:10, color:Z})
      uvRow.getCell('G').alignment = al('center','center',false)
      uvRow.getCell('H').value     = { formula: `${medjuzbirAddr}*${uvecPct}/100`, result: grandTotalJS*uvecPct/100 }
      uvRow.getCell('H').numFmt    = FMT_CUR
      uvRow.getCell('H').font      = font({size:10, color:Z})
      uvRow.getCell('H').alignment = al('center','center',false)
      uvecAddr = `H${uvRow.number}`
    }

    if (umanPct > 0) {
      const umRow = ws.addRow(['','','','','','',`− Umanjenje (${umanPct}%):`,''])
      ws.mergeCells(`B${umRow.number}:F${umRow.number}`)
      umRow.height = 14.1
      umRow.getCell('G').font      = font({size:10, color:'C0392B'})
      umRow.getCell('G').alignment = al('center','center',false)
      umRow.getCell('H').value     = { formula: `${medjuzbirAddr}*${umanPct}/100`, result: grandTotalJS*umanPct/100 }
      umRow.getCell('H').numFmt    = FMT_CUR
      umRow.getCell('H').font      = font({size:10, color:'C0392B'})
      umRow.getCell('H').alignment = al('center','center',false)
      umanAddr = `H${umRow.number}`
    }

    // Sveukupno — formula: Međuzbir (+ Uvećanje) (- Umanjenje), sve živo povezano
    let sveukupnoFormula = medjuzbirAddr
    if (uvecAddr) sveukupnoFormula += `+${uvecAddr}`
    if (umanAddr) sveukupnoFormula += `-${umanAddr}`
    const jsSveukupno = grandTotalJS + (uvecPct>0 ? grandTotalJS*uvecPct/100 : 0) - (umanPct>0 ? grandTotalJS*umanPct/100 : 0)

    const svRow = ws.addRow(['','','','','','','SVEUKUPNO:',''])
    ws.mergeCells(`B${svRow.number}:F${svRow.number}`)
    svRow.height = 18
    ;['B','C','D','E','F','G','H'].forEach(col => {
      svRow.getCell(col).fill   = fill('E8F0EC')
      svRow.getCell(col).font   = font({bold:true, size:12, color:Z})
      svRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
    })
    svRow.getCell('G').alignment = al('center','center',false)
    svRow.getCell('H').value     = { formula: sveukupnoFormula, result: jsSveukupno }
    svRow.getCell('H').numFmt    = FMT_CUR
    svRow.getCell('H').alignment = al('center','center',false)

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
