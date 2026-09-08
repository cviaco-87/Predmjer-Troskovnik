/**
 * AUTOMATSKE PROVJERE KODA — Predmjer / Troškovnik
 *
 * Čemu služi: hvata greške koje kompajliranje NE hvata, a koje ruše aplikaciju u pregledniku
 * (bijeli ekran). Najčešća je poziv funkcije koja ne postoji — sintaksno je ispravan, pa build
 * prođe, ali React obori komponentu čim se izvrši.
 *
 * Kako se pokreće: automatski na GitHubu pri svakom commitu (vidi .github/workflows/provjere.yml).
 * Rezultat se vidi kao ✓ ili ✗ pored commita — nije potreban nikakav program na računaru.
 *
 * VAŽNO: ovaj fajl NIJE dio aplikacije. Ne uvozi ga nijedna komponenta i ne ulazi u build.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

let greske = 0
let provjereno = 0

const ok = (poruka) => { provjereno++; console.log(`  ✓ ${poruka}`) }
const greska = (poruka) => { greske++; console.log(`  ✗ ${poruka}`) }

// ── Pomoćno: prepoznavanje ugrađenih funkcija koje ne definišemo mi ──
const UGRADJENE = new Set(`
require parseInt parseFloat isNaN String Number Boolean Object Array JSON Math Date
Promise Set Map WeakMap Symbol Error RegExp Proxy Reflect BigInt
setTimeout clearTimeout setInterval clearInterval fetch alert confirm prompt
atob btoa encodeURIComponent decodeURIComponent structuredClone
requestAnimationFrame cancelAnimationFrame import
`.trim().split(/\s+/))

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 1: nema poziva nedefinisanih funkcija (uzrok bijelog ekrana)
//
// Kako radi: esbuild pretvori JSX u obični JavaScript, pa se kod PARSIRA u stablo
// (acorn) i tačno se očitaju sve definicije i svi pozivi. Ranija verzija je koristila
// tekstualne obrasce i bila nepouzdana na fajlu od 4000 linija — propuštala je greške.
// ═══════════════════════════════════════════════════════════════════════════
async function provjeriNedefinisane(fajl) {
  let js
  try {
    js = execSync(`npx --yes esbuild@0.21.5 ${fajl} --loader:.jsx=jsx --format=esm`,
                  { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 })
  } catch (e) {
    greska(`${path.basename(fajl)} — kod se ne može pročitati (sintaksna greška?)`)
    return
  }

  let ast
  try { ast = acorn.parse(js, { ecmaVersion: 2022, sourceType: 'module' }) }
  catch (e) { greska(`${path.basename(fajl)} — neispravna sintaksa: ${e.message}`); return }

  const definisano = new Set()
  const pozvano = new Set()
  walk.full(ast, (n) => {
    if (n.type === 'VariableDeclarator') {
      if (n.id.type === 'Identifier') definisano.add(n.id.name)
      if (n.id.type === 'ArrayPattern') n.id.elements.forEach(e => e?.name && definisano.add(e.name))
      if (n.id.type === 'ObjectPattern') n.id.properties.forEach(p => p.value?.name && definisano.add(p.value.name))
    }
    if (n.type === 'FunctionDeclaration' && n.id) definisano.add(n.id.name)
    if (n.type === 'ClassDeclaration' && n.id) definisano.add(n.id.name)
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      n.params.forEach(p => {
        if (p.type === 'Identifier') definisano.add(p.name)
        else if (p.type === 'ObjectPattern') p.properties.forEach(x => x.value?.name && definisano.add(x.value.name))
        else if (p.type === 'AssignmentPattern' && p.left?.name) definisano.add(p.left.name)
        else if (p.type === 'RestElement' && p.argument?.name) definisano.add(p.argument.name)
      })
    }
    if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier')
      definisano.add(n.local.name)
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') pozvano.add(n.callee.name)
  })

  const fale = [...pozvano].filter(x => !definisano.has(x) && !UGRADJENE.has(x))
  if (fale.length === 0) ok(`${path.basename(fajl)} — sve pozvane funkcije postoje`)
  else greska(`${path.basename(fajl)} — POZIVAJU SE NEPOSTOJEĆE FUNKCIJE: ${fale.join(', ')} (aplikacija bi pukla u pregledniku)`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 2: sigurnost — nema tajni u kodu koji ide u preglednik
// ═══════════════════════════════════════════════════════════════════════════
function provjeriTajne() {
  const klijentski = fs.readdirSync('src').filter(f => /\.(jsx?|js)$/.test(f)).map(f => `src/${f}`)
  let nadjeno = []
  for (const f of klijentski) {
    const s = fs.readFileSync(f, 'utf8')
    if (/sk-ant-[A-Za-z0-9]/.test(s)) nadjeno.push(`${f}: Anthropic ključ`)
    if (/ANTHROPIC_API_KEY/.test(s)) nadjeno.push(`${f}: ANTHROPIC_API_KEY`)
    if (/SERVICE_ROLE|service_role/.test(s)) nadjeno.push(`${f}: Supabase service_role ključ`)
  }
  if (nadjeno.length === 0) ok('nema tajnih ključeva u klijentskom kodu')
  else greska(`TAJNE U KLIJENTSKOM KODU: ${nadjeno.join('; ')}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 3: sve API rute traže prijavu korisnika
// ═══════════════════════════════════════════════════════════════════════════
function provjeriAuth() {
  const rute = fs.readdirSync('api').filter(f => f.endsWith('.js') && !f.startsWith('_'))
  const bez = rute.filter(f => !fs.readFileSync(`api/${f}`, 'utf8').includes('proveriAutentikaciju'))
  if (bez.length === 0) ok(`sve API rute traže prijavu (${rute.length} ruta)`)
  else greska(`API rute BEZ provjere prijave: ${bez.join(', ')}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 4: kolone koje kod upisuje postoje u šemi baze
// ═══════════════════════════════════════════════════════════════════════════
function provjeriSemu() {
  if (!fs.existsSync('supabase_setup.sql')) { ok('šema se ne provjerava (nema supabase_setup.sql)'); return }
  const sql = fs.readFileSync('supabase_setup.sql', 'utf8')
  const kod = ['src/App.jsx', 'src/MojaBaza.jsx'].filter(fs.existsSync)
    .map(f => fs.readFileSync(f, 'utf8')).join('\n')

  const problemi = []
  for (const m of kod.matchAll(/from\('(\w+)'\)\s*\.(insert|update)\(\{([^}]*)\}/gs)) {
    const [, tabela, , tijelo] = m
    const uSemi = new Set([
      ...[...sql.matchAll(new RegExp(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS (\\w+)`, 'g'))].map(x => x[1]),
      ...((sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${tabela} \\(([\\s\\S]*?)\\n\\);`))?.[1] || '')
        .match(/^\s{2}(\w+)/gm) || []).map(x => x.trim()),
    ])
    if (uSemi.size === 0) continue // tabela nije u šemi (npr. dinamički naziv) — preskoči
    for (const k of tijelo.matchAll(/([a-z_]+)\s*:/g)) {
      if (!uSemi.has(k[1])) problemi.push(`${tabela}.${k[1]}`)
    }
  }
  if (problemi.length === 0) ok('sve kolone koje kod upisuje postoje u šemi baze')
  else greska(`kod upisuje kolone kojih NEMA u šemi: ${[...new Set(problemi)].join(', ')}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 5: kloniranje projekta prenosi sva aktivna polja
// ═══════════════════════════════════════════════════════════════════════════
function provjeriKloniranje() {
  const s = fs.readFileSync('src/App.jsx', 'utf8')
  const poc = s.indexOf('const klonirajProjekat')
  if (poc === -1) { ok('kloniranje se ne provjerava (funkcija nije nađena)'); return }
  const klon = s.slice(poc, s.indexOf('Ucitaj projekte i odaberi novi', poc))
  const klonirana = new Set([...klon.matchAll(/^\s+([a-z_]+):/gm)].map(m => m[1]))

  // Polja koja MORAJU biti u klonu da se projekat vjerno prekopira.
  const obavezna = [
    'naziv', 'klijent', 'adresa', 'datum', 'valuta', 'struke',
    'uvecanje_pct', 'umanjenje_pct', 'prikazi_finalnu', 'rucne_faze',
    'struka_kod', 'opsti_uslovi', 'kategorija',
    'jedinica', 'cijena', 'kolicina', 'redoslijed', 'sifra', 'opis_visina', 'parent_id',
  ]
  const fale = obavezna.filter(k => !klonirana.has(k))
  if (fale.length === 0) ok(`kloniranje prenosi sva obavezna polja (${obavezna.length})`)
  else greska(`KLONIRANJE NE PRENOSI: ${fale.join(', ')} — klon bi izgubio te podatke`)
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVJERA 6: nema zaostalih alert() prozora (zamijenjeni obavještenjima)
// ═══════════════════════════════════════════════════════════════════════════
function provjeriAlert() {
  const fajlovi = fs.readdirSync('src').filter(f => f.endsWith('.jsx')).map(f => `src/${f}`)
  // Komentari se uklanjaju da spomen "alert()" u objašnjenju ne bi bio protumačen kao poziv.
  const bezKomentara = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  const sa = fajlovi.filter(f => /(?<![.\w])alert\s*\(/.test(bezKomentara(fs.readFileSync(f, 'utf8'))))
  if (sa.length === 0) ok('nema alert() prozora preglednika (koriste se obavještenja u aplikaciji)')
  else greska(`zaostali alert() u: ${sa.join(', ')}`)
}

// ── POKRETANJE ──
console.log('\n═══ PROVJERE KODA — Predmjer / Troškovnik ═══\n')

console.log('Nedefinisane funkcije (uzrok bijelog ekrana):')
for (const f of ['src/App.jsx', 'src/AIAsistent.jsx', 'src/MojaBaza.jsx', 'src/Uputstvo.jsx', 'src/Auth.jsx'])
  if (fs.existsSync(f)) await provjeriNedefinisane(f)

console.log('\nSigurnost:')
provjeriTajne()
provjeriAuth()

console.log('\nPodaci:')
provjeriSemu()
provjeriKloniranje()

console.log('\nDosljednost:')
provjeriAlert()

console.log(`\n${'─'.repeat(50)}`)
if (greske === 0) {
  console.log(`✅ SVE PROVJERE PROŠLE (${provjereno})\n`)
  process.exit(0)
} else {
  console.log(`❌ NEUSPJEŠNIH PROVJERA: ${greske} (od ${provjereno + greske})\n`)
  process.exit(1)
}
