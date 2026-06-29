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
      return dj.length>0 ? dj.reduce((s,d)=>s+calcSimple(d),0) : calcSimple(p)
    }
    const fmtJmj = j => (j||'').replace(/m2\b/g,'m²').replace(/m3\b/g,'m³').replace(/m1\b/g,'m¹')
    const strip = s => (s||'').replace(/\*\*([^*]+)\*\*/g,'$1')
    // Sigurno pisanje broja koji NE smije biti datum
    const safeNum = v => {
      const n = parseFloat(v)
      if (isNaN(n)) return null
      return n
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Predmjer/Troškovnik'
    const ws = wb.addWorksheet('Predmjer', { views:[{showGridLines:false}] })

    // Tacne sirine kao u referentnom fajlu
    ws.columns = [
      {width:8},      // A - R.br.
      {width:51.14},  // B - Opis
      {width:4.86},   // C - J.mj.
      {width:12.29},  // D - Jed. cijena
      {width:8.43},   // E - Količina
      {width:5.71},   // F - Rabat
      {width:12},     // G - Ukupno
    ]

    const Z = '1B4332'  // zelena
    const ZS = 'EEF3F1' // zelena svijetla
    const ZM = 'E8F0EC' // zelena medium
    const SI = 'F8FAF8' // siva 1
    const SI2 = 'FAFAF8' // siva 2
    const SI3 = 'F5F8F6' // siva 3

    const fill = c => ({type:'pattern',pattern:'solid',fgColor:{argb:'FF'+c}})
    const font = (opts) => ({
      bold: opts.bold||false,
      italic: opts.italic||false,
      size: opts.size||10,
      color: opts.color ? {argb:'FF'+opts.color} : undefined,
      name: 'Calibri'
    })
    const align = (h,v,wrap) => ({horizontal:h||'left',vertical:v||'top',wrapText:wrap!==false})
    const border = (style,color) => ({
      top:{style,color:{argb:'FF'+(color||'D8D5CC')}},
      bottom:{style,color:{argb:'FF'+(color||'D8D5CC')}}
    })
    const borderB = (style,color) => ({bottom:{style,color:{argb:'FF'+(color||'D8D5CC')}}})
    const borderT = (style,color) => ({top:{style,color:{argb:'FF'+(color||'D8D5CC')}}})

    let row

    // ── NASLOV ──
    row = ws.addRow(['PREDMJER I PREDRAČUN','','','','','',''])
    ws.mergeCells(`A${row.number}:G${row.number}`)
    row.height = 22
    row.getCell(1).font = font({bold:true,size:15,color:Z})
    row.getCell(1).alignment = align('center','middle',false)

    // ── INFO ──
    row = ws.addRow(['Projekat:', projekat.naziv||'','','','Investitor:', projekat.klijent||'',''])
    ws.mergeCells(`B${row.number}:C${row.number}`)
    ws.mergeCells(`F${row.number}:G${row.number}`)
    row.height = 13
    row.getCell(1).font = font({size:9,color:'888888'})
    row.getCell(2).font = font({bold:true,size:9})
    row.getCell(5).font = font({size:9,color:'888888'})
    row.getCell(6).font = font({bold:true,size:9})
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    row = ws.addRow(['Lokacija:', projekat.adresa||'','','','Datum:', projekat.datum||'',''])
    ws.mergeCells(`B${row.number}:C${row.number}`)
    ws.mergeCells(`F${row.number}:G${row.number}`)
    row.height = 13
    row.getCell(1).font = font({size:9,color:'888888'})
    row.getCell(2).font = font({bold:true,size:9})
    row.getCell(5).font = font({size:9,color:'888888'})
    row.getCell(6).font = font({bold:true,size:9})
    row.getCell(6).numFmt = '@' // tekst format da ne postane datum
    row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

    // Prazan red
    row = ws.addRow([])
    ws.mergeCells(`A${row.number}:G${row.number}`)
    row.height = 8

    // ── KALKULACIJE ──
    let grandTotal = 0
    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      grandTotal += poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
    }
    const uvecIznos = grandTotal*(uvR+uvM)/100
    const umanIznos = grandTotal*(umR+umM)/100
    const ukupno = grandTotal+uvecIznos-umanIznos

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
      for (const p of roditelji) { const k=p.kategorija||'Ostalo'; if(!byK[k]) byK[k]=[]; byK[k].push(p) }

      // Faza naslov
      row = ws.addRow([f.naziv.toUpperCase(),'','','','','',''])
      ws.mergeCells(`A${row.number}:G${row.number}`)
      row.height = 18
      row.getCell(1).font = font({bold:true,size:11,color:Z})
      row.getCell(1).border = borderB('medium',Z)
      row.eachCell({includeEmpty:true}, c => { c.fill = fill('FFFFFF') })

      // Zaglavlje
      row = ws.addRow(['R.br.','Opis pozicije','J.mj.','Jed. cijena (€)','Količina','Rabat','Ukupno (€)'])
      row.height = 28
      const thAligns = ['center','left','center','right','right','right','right']
      row.eachCell((cell,col) => {
        cell.fill = fill(Z)
        cell.font = font({bold:true,size:9,color:'FFFFFF'})
        cell.alignment = align(thAligns[col-1],'middle',true)
        cell.border = borderB('medium','145229')
      })

      let rb=1; let par=0
      for (const [k,stavke] of Object.entries(byK)) {
        // Kategorija
        row = ws.addRow([k.toUpperCase(),'','','','','',''])
        ws.mergeCells(`A${row.number}:G${row.number}`)
        row.height = 14
        row.getCell(1).fill = fill(ZS)
        row.getCell(1).font = font({bold:true,size:9,color:Z})
        row.getCell(1).border = borderB('thin','C8C5BD')

        for (const p of stavke) {
          const djeca = djecaMap[p.id]||[]
          const imadjece = djeca.length>0
          const u = calcRow(p,poz)
          const ispar = par%2===1
          const bg = ispar ? SI : 'FFFFFF'
          const naziv = strip(p.naziv||'')
          const visina = Math.max(14, Math.min(150, Math.ceil(naziv.length/55)*12+4))

          row = ws.addRow(['','','','','','',''])
          row.height = visina

          // R.br. - kao tekst da ne postane datum
          row.getCell(1).value = String(rb++)
          row.getCell(1).fill = fill(bg)
          row.getCell(1).font = font({size:9,color:'666666'})
          row.getCell(1).alignment = align('center','top',false)
          row.getCell(1).border = borderB('thin','EEECEA')

          // Opis
          row.getCell(2).value = naziv
          row.getCell(2).fill = fill(bg)
          row.getCell(2).font = font({size:9.5})
          row.getCell(2).alignment = align('left','top',true)
          row.getCell(2).border = borderB('thin','EEECEA')

          // J.mj.
          row.getCell(3).value = fmtJmj(p.jedinica)
          row.getCell(3).fill = fill(bg)
          row.getCell(3).font = font({size:9,color:'555555'})
          row.getCell(3).alignment = align('center','top',false)
          row.getCell(3).border = borderB('thin','EEECEA')

          // Jed. cijena - VAZNO: ne smije biti datum!
          if (imadjece) {
            row.getCell(4).value = 'zbir'
            row.getCell(4).font = font({size:9,italic:true,color:'888888'})
            row.getCell(4).alignment = align('center','top',false)
          } else if (p.cijena>0) {
            row.getCell(4).value = safeNum(p.cijena)
            row.getCell(4).numFmt = '#,##0.00'
            row.getCell(4).font = font({size:9.5})
            row.getCell(4).alignment = align('right','top',false)
          } else {
            row.getCell(4).value = '—'
            row.getCell(4).font = font({size:9,color:'999999'})
            row.getCell(4).alignment = align('center','top',false)
          }
          row.getCell(4).fill = fill(bg)
          row.getCell(4).border = borderB('thin','EEECEA')

          // Količina
          if (imadjece || !p.kolicina || p.kolicina==0) {
            row.getCell(5).value = '—'
            row.getCell(5).font = font({size:9,color:'999999'})
            row.getCell(5).alignment = align('center','top',false)
          } else {
            row.getCell(5).value = safeNum(p.kolicina)
            row.getCell(5).numFmt = '#,##0.##'
            row.getCell(5).font = font({size:9.5})
            row.getCell(5).alignment = align('right','top',false)
          }
          row.getCell(5).fill = fill(bg)
          row.getCell(5).border = borderB('thin','EEECEA')

          // Rabat
          if (!imadjece && p.rabat>0) {
            row.getCell(6).value = safeNum(p.rabat)
            row.getCell(6).numFmt = '0.0"%"'
            row.getCell(6).font = font({size:9})
            row.getCell(6).alignment = align('right','top',false)
          } else {
            row.getCell(6).value = '—'
            row.getCell(6).font = font({size:9,color:'999999'})
            row.getCell(6).alignment = align('center','top',false)
          }
          row.getCell(6).fill = fill(bg)
          row.getCell(6).border = borderB('thin','EEECEA')

          // Ukupno
          if (u>0) {
            row.getCell(7).value = safeNum(u)
            row.getCell(7).numFmt = '#,##0.00 €'
            row.getCell(7).font = font({bold:true,size:9.5,color:Z})
            row.getCell(7).alignment = align('left','top',false)
          } else {
            row.getCell(7).value = '—'
            row.getCell(7).font = font({bold:true,size:9,color:Z})
            row.getCell(7).alignment = align('center','top',false)
          }
          row.getCell(7).fill = fill(bg)
          row.getCell(7).border = borderB('thin','EEECEA')

          // ── PODSTAVKE ──
          if (imadjece) {
            djeca.forEach((d,di) => {
              const du = calcSimple(d)
              const dNaziv = strip(d.naziv||'')
              const dRow = ws.addRow(['','','','','','',''])
              dRow.height = Math.max(14, Math.ceil(dNaziv.length/55)*11+4)

              // R.br. podstavke - VAZNO: kao tekst sa apostrofom prefix
              dRow.getCell(1).value = `${rb-1}.${di+1}`
              dRow.getCell(1).numFmt = '@' // tekst format - spriječava datum konverziju
              dRow.getCell(1).fill = fill(SI2)
              dRow.getCell(1).font = font({size:9,color:'AAAAAA'})
              dRow.getCell(1).alignment = align('center','top',false)
              dRow.getCell(1).border = borderB('thin','EEECEA')

              dRow.getCell(2).value = dNaziv
              dRow.getCell(2).fill = fill(SI2)
              dRow.getCell(2).font = font({size:9,color:'444444'})
              dRow.getCell(2).alignment = align('left','top',true)
              dRow.getCell(2).border = borderB('thin','EEECEA')

              dRow.getCell(3).value = fmtJmj(d.jedinica)
              dRow.getCell(3).fill = fill(SI2)
              dRow.getCell(3).font = font({size:9,color:'555555'})
              dRow.getCell(3).alignment = align('center','top',false)
              dRow.getCell(3).border = borderB('thin','EEECEA')

              // Cijena podstavke - kao BROJ ne datum
              if (d.cijena>0) {
                dRow.getCell(4).value = safeNum(d.cijena)
                dRow.getCell(4).numFmt = '#,##0.00'
                dRow.getCell(4).alignment = align('center','top',false)
              } else {
                dRow.getCell(4).value = '—'
                dRow.getCell(4).alignment = align('center','top',false)
              }
              dRow.getCell(4).fill = fill(SI2)
              dRow.getCell(4).font = font({size:9})
              dRow.getCell(4).border = borderB('thin','EEECEA')

              if (d.kolicina>0) {
                dRow.getCell(5).value = safeNum(d.kolicina)
                dRow.getCell(5).numFmt = '#,##0.##'
                dRow.getCell(5).alignment = align('center','top',false)
              } else {
                dRow.getCell(5).value = '—'
                dRow.getCell(5).alignment = align('center','top',false)
              }
              dRow.getCell(5).fill = fill(SI2)
              dRow.getCell(5).font = font({size:9})
              dRow.getCell(5).border = borderB('thin','EEECEA')

              if (d.rabat>0) {
                dRow.getCell(6).value = safeNum(d.rabat)
                dRow.getCell(6).numFmt = '0.0"%"'
                dRow.getCell(6).alignment = align('right','top',false)
              } else {
                dRow.getCell(6).value = '—'
                dRow.getCell(6).alignment = align('center','top',false)
              }
              dRow.getCell(6).fill = fill(SI2)
              dRow.getCell(6).font = font({size:9})
              dRow.getCell(6).border = borderB('thin','EEECEA')

              if (du>0) {
                dRow.getCell(7).value = safeNum(du)
                dRow.getCell(7).numFmt = '#,##0.00 €'
                dRow.getCell(7).font = font({size:9,color:'4A7C65'})
                dRow.getCell(7).alignment = align('left','top',false)
              } else {
                dRow.getCell(7).value = '—'
                dRow.getCell(7).font = font({size:9})
                dRow.getCell(7).alignment = align('center','top',false)
              }
              dRow.getCell(7).fill = fill(SI2)
              dRow.getCell(7).border = borderB('thin','EEECEA')
            })

            // Red "Ukupno"
            const ukKol = djeca.reduce((s,d)=>s+(parseFloat(d.kolicina)||0),0)
            const sumRow = ws.addRow(['','','','','','',''])
            ws.mergeCells(`B${sumRow.number}:F${sumRow.number}`)
            sumRow.height = 13
            sumRow.getCell(2).value = `Ukupno: ${ukKol.toFixed(2)} ${fmtJmj(p.jedinica)}`
            sumRow.getCell(2).fill = fill(SI3)
            sumRow.getCell(2).font = font({size:8.5,color:'666666',italic:true})
            sumRow.eachCell({includeEmpty:true}, c => {
              c.fill = fill(SI3)
              c.border = borderB('thin','D8D5CC')
            })
            if (u>0) {
              sumRow.getCell(7).value = safeNum(u)
              sumRow.getCell(7).numFmt = '#,##0.00 €'
              sumRow.getCell(7).font = font({bold:true,size:9,color:Z})
              sumRow.getCell(7).alignment = align('left','middle',false)
              sumRow.getCell(7).border = {
                top:{style:'medium',color:{argb:'FF'+Z}},
                bottom:{style:'thin',color:{argb:'FFD8D5CC'}}
              }
            }
          }
          par++
        }
      }

      // Ukupno faza
      const ft = roditelji.reduce((s,p)=>s+calcRow(p,poz),0)
      const totRow = ws.addRow(['','','','','','',''])
      ws.mergeCells(`A${totRow.number}:F${totRow.number}`)
      totRow.height = 16
      totRow.getCell(1).value = `UKUPNO ${f.naziv.toUpperCase()}:`
      totRow.getCell(1).alignment = align('right','middle',false)
      totRow.eachCell({includeEmpty:true}, c => {
        c.fill = fill(ZS)
        c.font = font({bold:true,size:10})
        c.border = {top:{style:'medium',color:{argb:'FF'+Z}},bottom:{style:'medium',color:{argb:'FF'+Z}}}
        c.alignment = align('right','middle',false)
      })
      totRow.getCell(7).value = safeNum(ft)
      totRow.getCell(7).numFmt = '#,##0.00 €'
      totRow.getCell(7).font = font({bold:true,size:10,color:Z})
      totRow.getCell(7).alignment = align('left','middle',false)

      // Prazan red
      const prazan = ws.addRow([])
      ws.mergeCells(`A${prazan.number}:G${prazan.number}`)
      prazan.height = 8
    }

    // ── REKAPITULACIJA ──
    const rekNas = ws.addRow(['REKAPITULACIJA','','','','','',''])
    ws.mergeCells(`A${rekNas.number}:G${rekNas.number}`)
    rekNas.height = 18
    rekNas.getCell(1).font = font({bold:true,size:11,color:Z})
    rekNas.getCell(1).border = borderB('medium',Z)
    rekNas.eachCell({includeEmpty:true}, c => c.fill = fill('FFFFFF'))

    const rekHdr = ws.addRow(['Faza','','','','','','Ukupno (€)'])
    ws.mergeCells(`A${rekHdr.number}:F${rekHdr.number}`)
    rekHdr.height = 14
    rekHdr.eachCell({includeEmpty:true}, c => {
      c.fill = fill(Z)
      c.font = font({bold:true,size:9,color:'FFFFFF'})
      c.alignment = align('left','middle',false)
    })
    rekHdr.getCell(7).alignment = align('left','middle',false)

    for (const f of faze) {
      const poz = svePozicije[f.id]||[]
      const t = poz.filter(p=>!p.parent_id).reduce((s,p)=>s+calcRow(p,poz),0)
      const fRow = ws.addRow([f.naziv,'','','','','',''])
      ws.mergeCells(`A${fRow.number}:F${fRow.number}`)
      fRow.height = 14
      fRow.getCell(1).font = font({size:10})
      fRow.getCell(1).border = borderB('thin','EEECEA')
      fRow.getCell(7).value = safeNum(t)
      fRow.getCell(7).numFmt = '#,##0.00 €'
      fRow.getCell(7).font = font({bold:true,color:Z})
      fRow.getCell(7).alignment = align('left','top',false)
      fRow.getCell(7).border = borderB('thin','EEECEA')
    }

    // Međuzbir
    const mbRow = ws.addRow(['','','','','','Međuzbir:',''])
    ws.mergeCells(`A${mbRow.number}:E${mbRow.number}`)
    mbRow.height = 14
    mbRow.eachCell({includeEmpty:true}, c => {
      c.fill = fill(ZS)
      c.font = font({bold:true,size:10})
      c.border = {top:{style:'medium',color:{argb:'FF'+Z}},bottom:{style:'medium',color:{argb:'FF'+Z}}}
      c.alignment = align('right','middle',false)
    })
    mbRow.getCell(7).value = safeNum(grandTotal)
    mbRow.getCell(7).numFmt = '#,##0.00 €'
    mbRow.getCell(7).font = font({bold:true,size:10,color:Z})
    mbRow.getCell(7).alignment = align('left','middle',false)

    if (uvecIznos>0) {
      const uvRow = ws.addRow(['','','','','',`+ Uvećanje (${uvR+uvM}%):`,safeNum(uvecIznos)])
      ws.mergeCells(`A${uvRow.number}:E${uvRow.number}`)
      uvRow.height = 14
      uvRow.getCell(6).font = font({size:10,color:Z})
      uvRow.getCell(6).alignment = align('right','middle',false)
      uvRow.getCell(7).numFmt = '#,##0.00 €'
      uvRow.getCell(7).font = font({size:10,color:Z})
      uvRow.getCell(7).alignment = align('left','middle',false)
    }
    if (umanIznos>0) {
      const umRow = ws.addRow(['','','','','',`− Umanjenje (${umR+umM}%):`,safeNum(umanIznos)])
      ws.mergeCells(`A${umRow.number}:E${umRow.number}`)
      umRow.height = 14
      umRow.getCell(6).font = font({size:10,color:'C0392B'})
      umRow.getCell(6).alignment = align('right','middle',false)
      umRow.getCell(7).numFmt = '#,##0.00 €'
      umRow.getCell(7).font = font({size:10,color:'C0392B'})
      umRow.getCell(7).alignment = align('left','middle',false)
    }

    // Sveukupno
    const svRow = ws.addRow(['','','','','','SVEUKUPNO:',safeNum(ukupno)])
    ws.mergeCells(`A${svRow.number}:E${svRow.number}`)
    svRow.height = 18
    svRow.eachCell({includeEmpty:true}, c => {
      c.fill = fill(ZM)
      c.font = font({bold:true,size:12,color:Z})
      c.border = {top:{style:'medium',color:{argb:'FF'+Z}},bottom:{style:'medium',color:{argb:'FF'+Z}}}
      c.alignment = align('left','middle',false)
    })
    svRow.getCell(6).alignment = align('left','middle',false)
    svRow.getCell(7).numFmt = '#,##0.00 €'
    svRow.getCell(7).alignment = align('left','middle',false)

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
