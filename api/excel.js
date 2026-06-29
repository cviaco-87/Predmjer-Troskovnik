import ExcelJS from 'exceljs'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { projekat, faze, svePozicije, uvR=0, uvM=0, umR=0, umM=0 } = req.body

    const calcSimple = p => (parseFloat(p.kolicina)||0)*(parseFloat(p.cijena)||0)*(1-(parseFloat(p.rabat)||0)/100)
    const calcRow = (p, poz) => {
      const dj = poz.filter(d => d.parent_id === p.id)
      return dj.length > 0 ? dj.reduce((s,d) => s+calcSimple(d), 0) : calcSimple(p)
    }
    const fmtJmj = j => (j||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')
    const strip = s => (s||'').replace(/\*\*([^*]+)\*\*/g,'$1')
    const safeNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n }

    // Format datuma DD.MM.YYYY - čuvamo kao tekst da Excel ne konvertuje
    const formatDatum = d => {
      if (!d) return ''
      // Ako je već u formatu DD.MM.YYYY vrati kao jeste
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d
      // Ako je YYYY-MM-DD konvertuj u DD.MM.YYYY
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
    // Kolona A je prazna spacer
    ws.columns = [
      {width: 2.5},    // A - spacer
      {width: 8.0},    // B - R.br.
      {width: 51.14},  // C - Opis pozicije
      {width: 4.86},   // D - J.mj.
      {width: 10.71},  // E - Jed. cijena
      {width: 8.86},   // F - Količina
      {width: 14.0},   // G - Rabat  (u referentnom fajlu G=14)
      {width: 8.86},   // H - Ukupno
    ]

    // Boje iz referentnog fajla
    const Z   = '1B4332'  // tamnozelena
    const ZS  = 'EEF3F1'  // zelena svijetla (kategorija, ukupno faza)
    const SI  = 'F8FAF8'  // siva 1 (parni redovi)
    const SI2 = 'FAFAF8'  // siva 2 (podstavke)
    const SI3 = 'F5F8F6'  // siva 3 (ukupno podstavki red)

    const fill = c => ({type:'pattern', pattern:'solid', fgColor:{argb:'FF'+c}})
    const noFill = () => ({type:'none'})

    const font = (opts={}) => ({
      name: 'Calibri',
      bold:   opts.bold   || false,
      italic: opts.italic || false,
      size:   opts.size   || 10,
      color:  opts.color  ? {argb:'FF'+opts.color} : {argb:'FF000000'}
    })

    // h: horizontal align, v: vertical align, wrap: wrapText
    const al = (h, v, wrap) => ({
      horizontal: h || 'left',
      vertical:   v || 'top',
      wrapText:   wrap !== false
    })

    const borderBottom = (style='thin', color='D8D5CC') => ({
      bottom: {style, color:{argb:'FF'+color}}
    })
    const borderTopBottom = (topStyle, topColor, botStyle, botColor) => ({
      top:    {style:topStyle,  color:{argb:'FF'+topColor}},
      bottom: {style:botStyle||topStyle, color:{argb:'FF'+(botColor||topColor)}}
    })

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
    row.getCell('G').numFmt = '@'  // Tekst format - sprečava konverziju u datum
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // ── PRAZAN RED ──
    row = ws.addRow([])
    row.height = 8.1

    // ── KALKULACIJE ──
    let grandTotal = 0
    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      grandTotal += poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
    }
    const uvecIznos = grandTotal*(uvR+uvM)/100
    const umanIznos = grandTotal*(umR+umM)/100
    const ukupno    = grandTotal+uvecIznos-umanIznos

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
      row = ws.addRow(['','R.br.','Opis pozicije','J.mj.','Jed. cijena (€)','Količina','Rabat','Ukupno (€)'])
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
          const u       = calcRow(p, poz)
          const ispar   = par%2===1
          const bg      = ispar ? SI : 'FFFFFF'
          const naziv   = strip(p.naziv||'')
          const visina  = Math.max(14, Math.min(150, Math.ceil(naziv.length/52)*12+4))

          // ── GLAVNA STAVKA ──
          row = ws.addRow(['','','','','','','',''])
          row.height = visina

          // R.br.
          row.getCell('B').value     = String(rb++)
          row.getCell('B').fill      = fill(bg)
          row.getCell('B').font      = font({size:9, color:'666666'})
          row.getCell('B').alignment = al('center','top',false)
          row.getCell('B').border    = borderBottom('thin','EEECEA')

          // Opis
          row.getCell('C').value     = naziv
          row.getCell('C').fill      = fill(bg)
          row.getCell('C').font      = font({size:9.5})
          row.getCell('C').alignment = al('left','top',true)
          row.getCell('C').border    = borderBottom('thin','EEECEA')

          // J.mj.
          row.getCell('D').value     = fmtJmj(p.jedinica)
          row.getCell('D').fill      = fill(bg)
          row.getCell('D').font      = font({size:9, color:'555555'})
          row.getCell('D').alignment = al('center','center',false)
          row.getCell('D').border    = borderBottom('thin','EEECEA')

          // Jed. cijena — centrirana kao u referentnom fajlu
          if (imadjece) {
            row.getCell('E').value     = 'zbir'
            row.getCell('E').font      = font({size:9, italic:true, color:'888888'})
            row.getCell('E').alignment = al('center','center',false)
          } else if (p.cijena > 0) {
            row.getCell('E').value     = safeNum(p.cijena)
            row.getCell('E').numFmt    = '#,##0.00'
            row.getCell('E').font      = font({size:9.5})
            row.getCell('E').alignment = al('center','center',false)
          } else {
            row.getCell('E').value     = '—'
            row.getCell('E').font      = font({size:9, color:'999999'})
            row.getCell('E').alignment = al('center','center',false)
          }
          row.getCell('E').fill   = fill(bg)
          row.getCell('E').border = borderBottom('thin','EEECEA')

          // Količina — centrirana
          if (imadjece || !p.kolicina || p.kolicina==0) {
            row.getCell('F').value     = '—'
            row.getCell('F').font      = font({size:9, color:'999999'})
            row.getCell('F').alignment = al('center','center',false)
          } else {
            row.getCell('F').value     = safeNum(p.kolicina)
            row.getCell('F').numFmt    = '#,##0.##'
            row.getCell('F').font      = font({size:9.5})
            row.getCell('F').alignment = al('center','center',false)
          }
          row.getCell('F').fill   = fill(bg)
          row.getCell('F').border = borderBottom('thin','EEECEA')

          // Rabat — centriran
          if (!imadjece && p.rabat > 0) {
            row.getCell('G').value     = safeNum(p.rabat)
            row.getCell('G').numFmt    = '0.0"%"'
            row.getCell('G').font      = font({size:9})
            row.getCell('G').alignment = al('center','center',false)
          } else {
            row.getCell('G').value     = '—'
            row.getCell('G').font      = font({size:9, color:'999999'})
            row.getCell('G').alignment = al('center','center',false)
          }
          row.getCell('G').fill   = fill(bg)
          row.getCell('G').border = borderBottom('thin','EEECEA')

          // Ukupno — centrirano kao u referentnom fajlu
          if (u > 0) {
            row.getCell('H').value     = safeNum(u)
            row.getCell('H').numFmt    = '#,##0.00 \\€'
            row.getCell('H').font      = font({bold:true, size:9.5, color:Z})
            row.getCell('H').alignment = al('center','center',false)
          } else {
            row.getCell('H').value     = '—'
            row.getCell('H').font      = font({bold:true, size:9, color:Z})
            row.getCell('H').alignment = al('center','center',false)
          }
          row.getCell('H').fill   = fill(bg)
          row.getCell('H').border = borderBottom('thin','EEECEA')

          // ── PODSTAVKE ──
          if (imadjece) {
            djeca.forEach((d, di) => {
              const du    = calcSimple(d)
              const dNaziv = strip(d.naziv||'')
              const dRow  = ws.addRow(['','','','','','','',''])
              dRow.height = Math.max(14, Math.ceil(dNaziv.length/52)*11+4)

              // R.br. podstavke kao tekst (npr. "1.1")
              dRow.getCell('B').value     = `${rb-1}.${di+1}`
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

              // Cijena podstavke — centrirana
              if (d.cijena > 0) {
                dRow.getCell('E').value     = safeNum(d.cijena)
                dRow.getCell('E').numFmt    = '#,##0.00'
                dRow.getCell('E').alignment = al('center','center',false)
              } else {
                dRow.getCell('E').value     = '—'
                dRow.getCell('E').alignment = al('center','center',false)
              }
              dRow.getCell('E').fill   = fill(SI2)
              dRow.getCell('E').font   = font({size:9})
              dRow.getCell('E').border = borderBottom('thin','EEECEA')

              // Količina podstavke — centrirana
              if (d.kolicina > 0) {
                dRow.getCell('F').value     = safeNum(d.kolicina)
                dRow.getCell('F').numFmt    = '#,##0.##'
                dRow.getCell('F').alignment = al('center','center',false)
              } else {
                dRow.getCell('F').value     = '—'
                dRow.getCell('F').alignment = al('center','center',false)
              }
              dRow.getCell('F').fill   = fill(SI2)
              dRow.getCell('F').font   = font({size:9})
              dRow.getCell('F').border = borderBottom('thin','EEECEA')

              // Rabat podstavke — centriran
              if (d.rabat > 0) {
                dRow.getCell('G').value     = safeNum(d.rabat)
                dRow.getCell('G').numFmt    = '0.0"%"'
                dRow.getCell('G').alignment = al('center','center',false)
              } else {
                dRow.getCell('G').value     = '—'
                dRow.getCell('G').alignment = al('center','center',false)
              }
              dRow.getCell('G').fill   = fill(SI2)
              dRow.getCell('G').font   = font({size:9})
              dRow.getCell('G').border = borderBottom('thin','EEECEA')

              // Ukupno podstavke — centrirano
              if (du > 0) {
                dRow.getCell('H').value     = safeNum(du)
                dRow.getCell('H').numFmt    = '#,##0.00 \\€'
                dRow.getCell('H').font      = font({size:9, color:'4A7C65'})
                dRow.getCell('H').alignment = al('center','center',false)
              } else {
                dRow.getCell('H').value     = '—'
                dRow.getCell('H').font      = font({size:9})
                dRow.getCell('H').alignment = al('center','center',false)
              }
              dRow.getCell('H').fill   = fill(SI2)
              dRow.getCell('H').border = borderBottom('thin','EEECEA')
            })

            // ── RED "Ukupno" za podstavke ──
            const ukKol  = djeca.reduce((s,d)=>s+(parseFloat(d.kolicina)||0),0)
            const sumRow = ws.addRow(['','','','','','','',''])
            ws.mergeCells(`C${sumRow.number}:G${sumRow.number}`)
            sumRow.height = 12.95

            sumRow.getCell('B').fill   = fill(SI3)
            sumRow.getCell('B').border = borderBottom('thin','D8D5CC')

            sumRow.getCell('C').value     = `Ukupno: ${ukKol.toFixed(2)} ${fmtJmj(p.jedinica)}`
            sumRow.getCell('C').fill      = fill(SI3)
            sumRow.getCell('C').font      = font({size:8.5, color:'666666', italic:true})
            sumRow.getCell('C').alignment = al('left','center',false)
            sumRow.getCell('C').border    = borderBottom('thin','D8D5CC')

            sumRow.getCell('H').fill   = fill(SI3)
            sumRow.getCell('H').border = {
              top:    {style:'medium', color:{argb:'FF'+Z}},
              bottom: {style:'thin',   color:{argb:'FFD8D5CC'}}
            }
            if (u > 0) {
              sumRow.getCell('H').value     = safeNum(u)
              sumRow.getCell('H').numFmt    = '#,##0.00 \\€'
              sumRow.getCell('H').font      = font({bold:true, size:9, color:Z})
              sumRow.getCell('H').alignment = al('center','center',false)
            }
          }
          par++
        }
      }

      // ── UKUPNO FAZA ──
      const ft     = roditelji.reduce((s,p)=>s+calcRow(p,poz),0)
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
      totRow.getCell('H').value     = safeNum(ft)
      totRow.getCell('H').numFmt    = '#,##0.00 \\€'
      totRow.getCell('H').font      = font({bold:true, size:10, color:Z})
      totRow.getCell('H').alignment = al('center','center',false)

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

    // Header rekapitulacije
    const rekHdr = ws.addRow(['','Faza','','','','','','Ukupno (€)'])
    ws.mergeCells(`B${rekHdr.number}:G${rekHdr.number}`)
    rekHdr.height = 14.1
    ;['B','C','D','E','F','G','H'].forEach(col => {
      rekHdr.getCell(col).fill      = fill(Z)
      rekHdr.getCell(col).font      = font({bold:true, size:9, color:'FFFFFF'})
      rekHdr.getCell(col).alignment = al('left','center',false)
    })
    rekHdr.getCell('H').alignment = al('center','center',false)

    // Redovi faza u rekapitulaciji
    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      const t   = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
      const fRow = ws.addRow(['', f.naziv,'','','','','',''])
      ws.mergeCells(`B${fRow.number}:G${fRow.number}`)
      fRow.height = 14.1
      fRow.getCell('B').font      = font({size:10})
      fRow.getCell('B').border    = borderBottom('thin','EEECEA')
      fRow.getCell('H').value     = safeNum(t)
      fRow.getCell('H').numFmt    = '#,##0.00 \\€'
      fRow.getCell('H').font      = font({bold:true, color:Z})
      fRow.getCell('H').alignment = al('center','center',false)
      fRow.getCell('H').border    = borderBottom('thin','EEECEA')
    }

    // Međuzbir
    const mbRow = ws.addRow(['','','','','','','Međuzbir:',''])
    ws.mergeCells(`B${mbRow.number}:F${mbRow.number}`)
    mbRow.height = 14.1
    ;['B','C','D','E','F','G','H'].forEach(col => {
      mbRow.getCell(col).fill   = fill(ZS)
      mbRow.getCell(col).font   = font({bold:true, size:10})
      mbRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
    })
    mbRow.getCell('G').alignment = al('center','center',false)
    mbRow.getCell('H').value     = safeNum(grandTotal)
    mbRow.getCell('H').numFmt    = '#,##0.00 \\€'
    mbRow.getCell('H').font      = font({bold:true, size:10, color:Z})
    mbRow.getCell('H').alignment = al('center','center',false)

    if (uvecIznos > 0) {
      const uvRow = ws.addRow(['','','','','','',`+ Uvećanje (${uvR+uvM}%):`, safeNum(uvecIznos)])
      ws.mergeCells(`B${uvRow.number}:F${uvRow.number}`)
      uvRow.height = 14.1
      uvRow.getCell('G').font      = font({size:10, color:Z})
      uvRow.getCell('G').alignment = al('center','center',false)
      uvRow.getCell('H').numFmt    = '#,##0.00 \\€'
      uvRow.getCell('H').font      = font({size:10, color:Z})
      uvRow.getCell('H').alignment = al('center','center',false)
    }

    if (umanIznos > 0) {
      const umRow = ws.addRow(['','','','','','',`− Umanjenje (${umR+umM}%):`, safeNum(umanIznos)])
      ws.mergeCells(`B${umRow.number}:F${umRow.number}`)
      umRow.height = 14.1
      umRow.getCell('G').font      = font({size:10, color:'C0392B'})
      umRow.getCell('G').alignment = al('center','center',false)
      umRow.getCell('H').numFmt    = '#,##0.00 \\€'
      umRow.getCell('H').font      = font({size:10, color:'C0392B'})
      umRow.getCell('H').alignment = al('center','center',false)
    }

    // Sveukupno
    const svRow = ws.addRow(['','','','','','','SVEUKUPNO:', safeNum(ukupno)])
    ws.mergeCells(`B${svRow.number}:F${svRow.number}`)
    svRow.height = 18
    ;['B','C','D','E','F','G','H'].forEach(col => {
      svRow.getCell(col).fill   = fill('E8F0EC')
      svRow.getCell(col).font   = font({bold:true, size:12, color:Z})
      svRow.getCell(col).border = borderTopBottom('medium',Z,'medium',Z)
    })
    svRow.getCell('G').alignment = al('center','center',false)
    svRow.getCell('H').numFmt    = '#,##0.00 \\€'
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
