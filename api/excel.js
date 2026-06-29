import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { projekat, faze, svePozicije, uvR, uvM, umR, umM } = req.body

    // Dinamicki import xlsx
    const XLSX = await import('xlsx')

    const fmtN = n => (n || 0).toFixed(2)
    const calcRowSimple = p => (parseFloat(p.kolicina) || 0) * (parseFloat(p.cijena) || 0) * (1 - (parseFloat(p.rabat) || 0) / 100)
    const calcRow = (p, poz) => {
      const djeca = poz.filter(d => d.parent_id === p.id)
      if (djeca.length > 0) return djeca.reduce((s, d) => s + calcRowSimple(d), 0)
      return calcRowSimple(p)
    }

    const wb = XLSX.utils.book_new()

    // Stilovi
    const S = {
      naslov: { font: { bold: true, color: { rgb: '1B4332' }, sz: 15 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
      infoLab: { font: { color: { rgb: '888888' }, sz: 9 }, alignment: { wrapText: true } },
      infoVal: { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'FFFFFF' } }, alignment: { wrapText: true } },
      fazaNaslov: { font: { bold: true, color: { rgb: '1B4332' }, sz: 11 }, alignment: { wrapText: true }, border: { bottom: { style: 'thick', color: { rgb: '1B4332' } } } },
      th: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'FFFFFF' } } } },
      thR: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { horizontal: 'right', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'FFFFFF' } } } },
      kat: { font: { bold: true, color: { rgb: '1B4332' }, sz: 9 }, fill: { fgColor: { rgb: 'EEF3F1' } }, alignment: { wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'D8D5CC' } } } },
      rb: { font: { color: { rgb: '666666' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      rbPod: { font: { color: { rgb: 'AAAAAA' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      opis: { font: { sz: 9.5 }, alignment: { wrapText: true, vertical: 'top' }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      opisPod: { font: { color: { rgb: '444444' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, alignment: { wrapText: true, vertical: 'top', indent: 2 }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      jmj: { font: { color: { rgb: '555555' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      broj: { font: { sz: 9.5 }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      ukupno: { font: { bold: true, color: { rgb: '1B4332' }, sz: 9.5 }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      ukupnoPod: { font: { color: { rgb: '4A7C65' }, sz: 9 }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, fill: { fgColor: { rgb: 'FAFAF8' } }, border: { bottom: { style: 'medium', color: { rgb: 'EEECEA' } } } },
      podSum: { font: { italic: true, color: { rgb: '666666' }, sz: 8.5 }, fill: { fgColor: { rgb: 'F5F8F6' } }, alignment: { wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'D8D5CC' } } } },
      total: { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'EEF3F1' } }, alignment: { horizontal: 'right', wrapText: true }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      totalIznos: { font: { bold: true, color: { rgb: '1B4332' }, sz: 10 }, numFmt: '#,##0.00', fill: { fgColor: { rgb: 'EEF3F1' } }, alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      uvec: { font: { bold: true, color: { rgb: '1B4332' }, sz: 10 }, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
      uman: { font: { bold: true, color: { rgb: 'C0392B' }, sz: 10 }, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
      sveu: { font: { bold: true, color: { rgb: '1B4332' }, sz: 12 }, numFmt: '#,##0.00', fill: { fgColor: { rgb: 'E8F0EC' } }, alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      sveuLab: { font: { bold: true, color: { rgb: '1B4332' }, sz: 12 }, fill: { fgColor: { rgb: 'E8F0EC' } }, alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      rekapTh: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: 'FFFFFF' } } } },
      rekapNaslov: { font: { bold: true, color: { rgb: '1B4332' }, sz: 11 }, alignment: { wrapText: true }, border: { bottom: { style: 'thick', color: { rgb: '1B4332' } } } },
      prazno: {},
    }

    const C = (v, s, t) => ({ v, s, t: t || (typeof v === 'number' ? 'n' : 's') })
    const N = (v, s) => ({ v: parseFloat(v) || 0, s, t: 'n' })
    const TXT = (v, s) => ({ v: String(v || ''), s, t: 's' })

    let grandTotal = 0
    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      grandTotal += poz.filter(p => !p.parent_id).reduce((s, p) => s + calcRow(p, poz), 0)
    }
    const uvec = grandTotal * (uvR + uvM) / 100
    const uman = grandTotal * (umR + umM) / 100
    const ukupno = grandTotal + uvec - uman

    // ── JEDAN SHEET SA SVIM FAZAMA ──
    const data = []
    const merges = []
    const rowHeights = {}
    let r = 0

    // Naslov
    data.push([TXT('PREDMJER I PREDRAČUN', S.naslov)])
    merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
    rowHeights[r] = 19.5; r++

    // Info
    data.push([TXT('Projekat:', S.infoLab), TXT(projekat.naziv || '', S.infoVal), TXT('', S.prazno), TXT('', S.prazno), TXT('Investitor:', S.infoLab), TXT(projekat.klijent || '', S.infoVal), TXT('', S.prazno)])
    merges.push({ s: { r, c: 1 }, e: { r, c: 2 } })
    merges.push({ s: { r, c: 5 }, e: { r, c: 6 } })
    rowHeights[r] = 12.75; r++

    data.push([TXT('Lokacija:', S.infoLab), TXT(projekat.adresa || '', S.infoVal), TXT('', S.prazno), TXT('', S.prazno), TXT('Datum:', S.infoLab), TXT(projekat.datum || '', S.infoVal), TXT('', S.prazno)])
    merges.push({ s: { r, c: 1 }, e: { r, c: 2 } })
    merges.push({ s: { r, c: 5 }, e: { r, c: 6 } })
    rowHeights[r] = 12.75; r++

    data.push([TXT('', S.prazno)])
    merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
    rowHeights[r] = 10.5; r++

    // Faze
    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      if (!poz.length) continue

      const roditelji = poz.filter(p => !p.parent_id)
      const djecaMap = {}
      for (const p of poz) {
        if (p.parent_id) {
          if (!djecaMap[p.parent_id]) djecaMap[p.parent_id] = []
          djecaMap[p.parent_id].push(p)
        }
      }

      // Faza naslov
      data.push([TXT(f.naziv.toUpperCase(), S.fazaNaslov)])
      merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
      rowHeights[r] = 15.75; r++

      // Zaglavlje
      data.push([
        TXT('R.br.', S.th), TXT('Opis pozicije', S.th), TXT('J.mj.', S.th),
        TXT('Jed. cijena (€)', S.thR), TXT('Količina', S.thR),
        TXT('Rabat', S.thR), TXT('Ukupno (€)', S.thR)
      ])
      rowHeights[r] = 25.5; r++

      // Grupiši po kategorijama
      const byK = {}
      for (const p of roditelji) {
        const k = p.kategorija || 'Ostalo'
        if (!byK[k]) byK[k] = []
        byK[k].push(p)
      }

      let rb = 1
      let par = 0
      for (const [k, stavke] of Object.entries(byK)) {
        // Kategorija red
        data.push([TXT(k.toUpperCase(), S.kat)])
        merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
        rowHeights[r] = 13.5; r++

        for (const p of stavke) {
          const djeca = djecaMap[p.id] || []
          const imadjece = djeca.length > 0
          const u = calcRow(p, poz)
          const ispar = par % 2 === 1
          const rbS = { ...S.rb, fill: ispar ? { fgColor: { rgb: 'F8FAF8' } } : {} }
          const opisS = { ...S.opis, fill: ispar ? { fgColor: { rgb: 'F8FAF8' } } : {} }
          const jmjS = { ...S.jmj, fill: ispar ? { fgColor: { rgb: 'F8FAF8' } } : {} }
          const brS = { ...S.broj, fill: ispar ? { fgColor: { rgb: 'F8FAF8' } } : {} }
          const ukS = { ...S.ukupno, fill: ispar ? { fgColor: { rgb: 'F8FAF8' } } : {} }

          const jmj = (p.jedinica || '').replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³').replace(/m1\b/g, 'm¹')
          const naziv = (p.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1') // ukloni ** oznake

          data.push([
            TXT(String(rb++), rbS),
            TXT(naziv, opisS),
            TXT(jmj, jmjS),
            imadjece ? TXT('zbir', { ...brS, font: { italic: true, color: { rgb: '888888' }, sz: 9 } }) : (p.cijena > 0 ? N(p.cijena, brS) : TXT('—', brS)),
            imadjece ? TXT('—', brS) : (p.kolicina > 0 ? N(p.kolicina, brS) : TXT('—', brS)),
            (p.rabat > 0 && !imadjece) ? N(p.rabat, brS) : TXT('—', brS),
            u > 0 ? N(u, ukS) : TXT('—', ukS)
          ])
          // Visina reda - duži opisi dobijaju veće redove
          rowHeights[r] = Math.max(14.25, Math.min(200, Math.ceil(naziv.length / 70) * 12 + 4))
          r++

          // Podstavke
          if (imadjece) {
            djeca.forEach((d, di) => {
              const du = calcRowSimple(d)
              const dj = (d.jedinica || '').replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³').replace(/m1\b/g, 'm¹')
              const dn = (d.naziv || '').replace(/\*\*([^*]+)\*\*/g, '$1')
              data.push([
                TXT(`${rb-1}.${di+1}`, S.rbPod),
                TXT(dn, S.opisPod),
                TXT(dj, { ...S.jmj, fill: { fgColor: { rgb: 'FAFAF8' } } }),
                d.cijena > 0 ? N(d.cijena, { ...S.broj, fill: { fgColor: { rgb: 'FAFAF8' } } }) : TXT('—', { ...S.jmj, fill: { fgColor: { rgb: 'FAFAF8' } } }),
                d.kolicina > 0 ? N(d.kolicina, { ...S.broj, fill: { fgColor: { rgb: 'FAFAF8' } } }) : TXT('—', { ...S.jmj, fill: { fgColor: { rgb: 'FAFAF8' } } }),
                d.rabat > 0 ? N(d.rabat, { ...S.broj, fill: { fgColor: { rgb: 'FAFAF8' } } }) : TXT('—', { ...S.jmj, fill: { fgColor: { rgb: 'FAFAF8' } } }),
                du > 0 ? N(du, S.ukupnoPod) : TXT('—', { ...S.jmj, fill: { fgColor: { rgb: 'FAFAF8' } } })
              ])
              rowHeights[r] = 14.25; r++
            })
            // Ukupno red
            const ukKol = djeca.reduce((s, d) => s + (parseFloat(d.kolicina) || 0), 0)
            const jmj2 = (p.jedinica || '').replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³')
            data.push([
              TXT('', S.podSum),
              TXT(`Ukupno: ${ukKol.toFixed(2)} ${jmj2}`, S.podSum),
              TXT('', S.podSum), TXT('', S.podSum), TXT('', S.podSum), TXT('', S.podSum),
              N(u, { ...S.ukupno, fill: { fgColor: { rgb: 'F5F8F6' } } })
            ])
            rowHeights[r] = 13.5; r++
          }
          par++
        }
      }

      // Ukupno faza
      const fazaTotal = poz.filter(p => !p.parent_id).reduce((s, p) => s + calcRow(p, poz), 0)
      data.push([
        TXT('', S.total), TXT('', S.total), TXT('', S.total), TXT('', S.total), TXT('', S.total),
        TXT(`UKUPNO ${f.naziv.toUpperCase()}:`, S.total),
        N(fazaTotal, S.totalIznos)
      ])
      rowHeights[r] = 14.25; r++
      data.push([TXT('', S.prazno)])
      merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
      rowHeights[r] = 10; r++
    }

    // Rekapitulacija
    data.push([TXT('REKAPITULACIJA', S.rekapNaslov)])
    merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
    rowHeights[r] = 15.75; r++

    data.push([TXT('Faza', S.rekapTh), TXT('', S.rekapTh), TXT('', S.rekapTh), TXT('', S.rekapTh), TXT('', S.rekapTh), TXT('', S.rekapTh), TXT('Ukupno (€)', { ...S.thR })])
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } })
    rowHeights[r] = 14.25; r++

    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      const t = poz.filter(p => !p.parent_id).reduce((s, p) => s + calcRow(p, poz), 0)
      data.push([TXT(f.naziv, S.opis), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), N(t, S.ukupno)])
      merges.push({ s: { r, c: 0 }, e: { r, c: 5 } })
      rowHeights[r] = 14.25; r++
    }

    data.push([TXT('', S.total), TXT('', S.total), TXT('', S.total), TXT('', S.total), TXT('', S.total), TXT('Međuzbir:', S.total), N(grandTotal, S.totalIznos)])
    rowHeights[r] = 14.25; r++

    if (uvec > 0) {
      data.push([TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT(`+ Uvećanje (${uvR + uvM}%):`, { ...S.total, font: { color: { rgb: '1B4332' }, sz: 10 } }), N(uvec, S.uvec)])
      rowHeights[r] = 14.25; r++
    }
    if (uman > 0) {
      data.push([TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT('', S.prazno), TXT(`− Umanjenje (${umR + umM}%):`, { ...S.total, font: { color: { rgb: 'C0392B' }, sz: 10 } }), N(uman, S.uman)])
      rowHeights[r] = 14.25; r++
    }

    data.push([TXT('', S.sveuLab), TXT('', S.sveuLab), TXT('', S.sveuLab), TXT('', S.sveuLab), TXT('', S.sveuLab), TXT('SVEUKUPNO:', S.sveuLab), N(ukupno, S.sveu)])
    merges.push({ s: { r, c: 0 }, e: { r, c: 4 } })
    rowHeights[r] = 14.25; r++

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 8 }, { wch: 51 }, { wch: 7 }, { wch: 13 }, { wch: 10 }, { wch: 8 }, { wch: 13 }]
    ws['!merges'] = merges
    ws['!rows'] = Array.from({ length: r }, (_, i) => ({ hpt: rowHeights[i] || 14.25 }))

    XLSX.utils.book_append_sheet(wb, ws, 'Predmjer')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Predmjer_${(projekat.naziv || 'export').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`)
    res.send(buf)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
