import * as XLSX from 'xlsx'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { projekat, faze, svePozicije, uvR, uvM, umR, umM } = req.body

    const calcRowSimple = p => (parseFloat(p.kolicina) || 0) * (parseFloat(p.cijena) || 0) * (1 - (parseFloat(p.rabat) || 0) / 100)
    const calcRow = (p, poz) => {
      const djeca = (poz || []).filter(d => d.parent_id === p.id)
      if (djeca.length > 0) return djeca.reduce((s, d) => s + calcRowSimple(d), 0)
      return calcRowSimple(p)
    }
    const fmtJmj = j => (j || '').replace(/m2\b/g, 'm²').replace(/m3\b/g, 'm³').replace(/m1\b/g, 'm¹')
    const stripBold = s => (s || '').replace(/\*\*([^*]+)\*\*/g, '$1')

    const wb = XLSX.utils.book_new()

    // Stilovi
    const border = (style) => ({ top: { style, color: { rgb: 'D8D5CC' } }, bottom: { style, color: { rgb: 'D8D5CC' } }, left: { style, color: { rgb: 'D8D5CC' } }, right: { style, color: { rgb: 'D8D5CC' } } })
    const borderB = (style, color) => ({ bottom: { style, color: { rgb: color || 'D8D5CC' } } })

    const S = {
      naslov:     { font: { bold: true, color: { rgb: '1B4332' }, sz: 15 }, alignment: { horizontal: 'center', wrapText: true } },
      infoLab:    { font: { color: { rgb: '888888' }, sz: 9 }, alignment: { wrapText: true } },
      infoVal:    { font: { bold: true, sz: 9 }, alignment: { wrapText: true } },
      fazaNaslov: { font: { bold: true, color: { rgb: '1B4332' }, sz: 11 }, border: borderB('thick', '1B4332') },
      th:         { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { horizontal: 'center', wrapText: true }, border: borderB('medium', 'FFFFFF') },
      thR:        { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { horizontal: 'right', wrapText: true }, border: borderB('medium', 'FFFFFF') },
      kat:        { font: { bold: true, color: { rgb: '1B4332' }, sz: 9 }, fill: { fgColor: { rgb: 'EEF3F1' } }, alignment: { wrapText: true }, border: borderB('thin', 'C8C5BD') },
      rb:         { font: { color: { rgb: '666666' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true }, border: borderB('thin', 'EEECEA') },
      rbPar:      { font: { color: { rgb: '666666' }, sz: 9 }, fill: { fgColor: { rgb: 'F8FAF8' } }, alignment: { horizontal: 'center', vertical: 'top', wrapText: true }, border: borderB('thin', 'EEECEA') },
      rbPod:      { font: { color: { rgb: 'AAAAAA' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      opis:       { font: { sz: 9.5 }, alignment: { wrapText: true, vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      opisPar:    { font: { sz: 9.5 }, fill: { fgColor: { rgb: 'F8FAF8' } }, alignment: { wrapText: true, vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      opisPod:    { font: { color: { rgb: '444444' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, alignment: { wrapText: true, vertical: 'top', indent: 2 }, border: borderB('thin', 'EEECEA') },
      jmj:        { font: { color: { rgb: '555555' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      jmjPar:     { font: { color: { rgb: '555555' }, sz: 9 }, fill: { fgColor: { rgb: 'F8FAF8' } }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      jmjPod:     { font: { color: { rgb: '777777' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      broj:       { font: { sz: 9.5 }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      brojPar:    { font: { sz: 9.5 }, fill: { fgColor: { rgb: 'F8FAF8' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      brojPod:    { font: { sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      crt:        { font: { color: { rgb: '999999' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      crtPar:     { font: { color: { rgb: '999999' }, sz: 9 }, fill: { fgColor: { rgb: 'F8FAF8' } }, alignment: { horizontal: 'center', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      ukupno:     { font: { bold: true, color: { rgb: '1B4332' }, sz: 9.5 }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      ukupnoPar:  { font: { bold: true, color: { rgb: '1B4332' }, sz: 9.5 }, fill: { fgColor: { rgb: 'F8FAF8' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      ukupnoPod:  { font: { color: { rgb: '4A7C65' }, sz: 9 }, fill: { fgColor: { rgb: 'FAFAF8' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right', vertical: 'top' }, border: borderB('thin', 'EEECEA') },
      podSum:     { font: { italic: true, color: { rgb: '666666' }, sz: 8.5 }, fill: { fgColor: { rgb: 'F5F8F6' } }, alignment: { wrapText: true }, border: borderB('thin', 'D8D5CC') },
      podSumUk:   { font: { bold: true, color: { rgb: '1B4332' }, sz: 9 }, fill: { fgColor: { rgb: 'F5F8F6' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right' }, border: borderB('medium', '1B4332') },
      total:      { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'EEF3F1' } }, alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      totalIznos: { font: { bold: true, color: { rgb: '1B4332' }, sz: 10 }, fill: { fgColor: { rgb: 'EEF3F1' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      sveuLab:    { font: { bold: true, color: { rgb: '1B4332' }, sz: 12 }, fill: { fgColor: { rgb: 'E8F0EC' } }, alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      sveuIznos:  { font: { bold: true, color: { rgb: '1B4332' }, sz: 12 }, fill: { fgColor: { rgb: 'E8F0EC' } }, numFmt: '#,##0.00', alignment: { horizontal: 'right' }, border: { top: { style: 'medium', color: { rgb: '1B4332' } }, bottom: { style: 'medium', color: { rgb: '1B4332' } } } },
      rekapNas:   { font: { bold: true, color: { rgb: '1B4332' }, sz: 11 }, border: borderB('thick', '1B4332') },
      rekapTh:    { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { wrapText: true } },
      rekapThR:   { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1B4332' } }, alignment: { horizontal: 'right' } },
      prazno:     {}
    }

    const T = (v, s) => ({ v: v === null || v === undefined ? '' : String(v), t: 's', s })
    const N = (v, s) => ({ v: parseFloat(v) || 0, t: 'n', s })
    const CRTICE = (s) => ({ v: '—', t: 's', s })

    // Kalkulacije
    let grandTotal = 0
    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      grandTotal += poz.filter(p => !p.parent_id).reduce((s, p) => s + calcRow(p, poz), 0)
    }
    const uvecIznos = grandTotal * ((uvR || 0) + (uvM || 0)) / 100
    const umanIznos = grandTotal * ((umR || 0) + (umM || 0)) / 100
    const ukupno = grandTotal + uvecIznos - umanIznos

    const data = []
    const merges = []
    const rowH = []
    let r = 0

    const addRow = (cells, h) => { data.push(cells); rowH.push({ hpt: h || 14.25 }); r++ }
    const merge = (r, c1, c2) => merges.push({ s: { r, c: c1 }, e: { r, c: c2 } })

    // Naslov
    addRow([T('PREDMJER I PREDRAČUN', S.naslov)], 20)
    merge(r-1, 0, 6)

    addRow([T('Projekat:', S.infoLab), T(projekat.naziv || '', S.infoVal), T('', S.prazno), T('', S.prazno), T('Investitor:', S.infoLab), T(projekat.klijent || '', S.infoVal), T('', S.prazno)], 13)
    merge(r-1, 1, 2); merge(r-1, 5, 6)

    addRow([T('Lokacija:', S.infoLab), T(projekat.adresa || '', S.infoVal), T('', S.prazno), T('', S.prazno), T('Datum:', S.infoLab), T(projekat.datum || '', S.infoVal), T('', S.prazno)], 13)
    merge(r-1, 1, 2); merge(r-1, 5, 6)

    addRow([T('', S.prazno)], 8); merge(r-1, 0, 6)

    // Faze
    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      if (!poz.length) continue

      const djecaMap = {}
      for (const p of poz) {
        if (p.parent_id) {
          if (!djecaMap[p.parent_id]) djecaMap[p.parent_id] = []
          djecaMap[p.parent_id].push(p)
        }
      }
      const roditelji = poz.filter(p => !p.parent_id)

      // Faza naslov
      addRow([T(f.naziv.toUpperCase(), S.fazaNaslov)], 16)
      merge(r-1, 0, 6)

      // Header
      addRow([T('R.br.', S.th), T('Opis pozicije', S.th), T('J.mj.', S.th), T('Jed. cijena (€)', S.thR), T('Količina', S.thR), T('Rabat', S.thR), T('Ukupno (€)', S.thR)], 26)

      // Grupisano po kategorijama
      const byK = {}
      for (const p of roditelji) {
        const k = p.kategorija || 'Ostalo'
        if (!byK[k]) byK[k] = []
        byK[k].push(p)
      }

      let rb = 1
      let par = 0
      for (const [k, stavke] of Object.entries(byK)) {
        addRow([T(k.toUpperCase(), S.kat)], 14); merge(r-1, 0, 6)

        for (const p of stavke) {
          const djeca = djecaMap[p.id] || []
          const imadjece = djeca.length > 0
          const u = calcRow(p, poz)
          const ispar = par % 2 === 1
          const naziv = stripBold(p.naziv || '')
          const jmj = fmtJmj(p.jedinica)

          const rbS = ispar ? S.rbPar : S.rb
          const opisS = ispar ? S.opisPar : S.opis
          const jmjS = ispar ? S.jmjPar : S.jmj
          const brS = ispar ? S.brojPar : S.broj
          const crtS = ispar ? S.crtPar : S.crt
          const ukS = ispar ? S.ukupnoPar : S.ukupno

          const visina = Math.max(14, Math.min(180, Math.ceil(naziv.length / 60) * 12 + 4))

          addRow([
            T(String(rb++), rbS),
            T(naziv, opisS),
            T(jmj, jmjS),
            imadjece ? T('zbir', { ...brS, font: { italic: true, color: { rgb: '888888' }, sz: 9 } }) : (p.cijena > 0 ? N(p.cijena, brS) : CRTICE(crtS)),
            imadjece ? CRTICE(crtS) : (p.kolicina > 0 ? N(p.kolicina, brS) : CRTICE(crtS)),
            (p.rabat > 0 && !imadjece) ? N(p.rabat, brS) : CRTICE(crtS),
            u > 0 ? N(u, ukS) : CRTICE(crtS)
          ], visina)

          // Podstavke
          if (imadjece) {
            djeca.forEach((d, di) => {
              const du = calcRowSimple(d)
              addRow([
                T(`${rb-1}.${di+1}`, S.rbPod),
                T(stripBold(d.naziv || ''), S.opisPod),
                T(fmtJmj(d.jedinica), S.jmjPod),
                d.cijena > 0 ? N(d.cijena, S.brojPod) : CRTICE(S.jmjPod),
                d.kolicina > 0 ? N(d.kolicina, S.brojPod) : CRTICE(S.jmjPod),
                d.rabat > 0 ? N(d.rabat, S.brojPod) : CRTICE(S.jmjPod),
                du > 0 ? N(du, S.ukupnoPod) : CRTICE(S.jmjPod)
              ], 14)
            })
            const ukKol = djeca.reduce((s, d) => s + (parseFloat(d.kolicina) || 0), 0)
            addRow([T('', S.podSum), T(`Ukupno: ${ukKol.toFixed(2)} ${fmtJmj(p.jedinica)}`, S.podSum), T('', S.podSum), T('', S.podSum), T('', S.podSum), T('', S.podSum), N(u, S.podSumUk)], 13)
          }
          par++
        }
      }

      // Ukupno faza
      const fazaTotal = roditelji.reduce((s, p) => s + calcRow(p, poz), 0)
      addRow([T('', S.total), T('', S.total), T('', S.total), T('', S.total), T('', S.total), T(`UKUPNO ${f.naziv.toUpperCase()}:`, S.total), N(fazaTotal, S.totalIznos)], 14)
      addRow([T('', S.prazno)], 8); merge(r-1, 0, 6)
    }

    // Rekapitulacija
    addRow([T('REKAPITULACIJA', S.rekapNas)], 16); merge(r-1, 0, 6)
    addRow([T('Faza', S.rekapTh), T('', S.rekapTh), T('', S.rekapTh), T('', S.rekapTh), T('', S.rekapTh), T('', S.rekapTh), T('Ukupno (€)', S.rekapThR)], 14)
    merge(r-1, 0, 5)

    for (const f of faze) {
      const poz = svePozicije[f.id] || []
      const t = poz.filter(p => !p.parent_id).reduce((s, p) => s + calcRow(p, poz), 0)
      addRow([T(f.naziv, S.opis), T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), N(t, S.ukupno)], 14)
      merge(r-1, 0, 5)
    }

    addRow([T('', S.total), T('', S.total), T('', S.total), T('', S.total), T('', S.total), T('Međuzbir:', S.total), N(grandTotal, S.totalIznos)], 14)
    if (uvecIznos > 0) {
      addRow([T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), T(`+ Uvećanje (${(uvR||0)+(uvM||0)}%):`, { ...S.total, font: { color: { rgb: '1B4332' }, sz: 10 } }), N(uvecIznos, { ...S.totalIznos, font: { color: { rgb: '1B4332' }, bold: true, sz: 10 } })], 14)
    }
    if (umanIznos > 0) {
      addRow([T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), T('', S.prazno), T(`− Umanjenje (${(umR||0)+(umM||0)}%):`, { ...S.total, font: { color: { rgb: 'C0392B' }, sz: 10 } }), N(umanIznos, { ...S.totalIznos, font: { color: { rgb: 'C0392B' }, bold: true, sz: 10 } })], 14)
    }
    addRow([T('', S.sveuLab), T('', S.sveuLab), T('', S.sveuLab), T('', S.sveuLab), T('', S.sveuLab), T('SVEUKUPNO:', S.sveuLab), N(ukupno, S.sveuIznos)], 16)
    merge(r-1, 0, 4)

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 8 }, { wch: 52 }, { wch: 7 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 13 }]
    ws['!merges'] = merges
    ws['!rows'] = rowH

    XLSX.utils.book_append_sheet(wb, ws, 'Predmjer')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
    const ime = (projekat.naziv || 'Predmjer').replace(/[^a-zA-Z0-9_\u00C0-\u024F\s]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${ime}.xlsx"`)
    res.send(buf)

  } catch (err) {
    console.error('Excel error:', err)
    res.status(500).json({ error: err.message })
  }
}
