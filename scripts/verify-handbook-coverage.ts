/**
 * Read-only verification of the coverage grid against the real database.
 * Prints aggregates and page titles only -- no policy bodies, no PII.
 *
 * Expected per spec 6.1: 21 pages, 117 covered, 25 intentional, 5 unreviewed.
 */
import { getAllPagesForAdmin } from '../lib/handbook/admin-queries'
import { computeCoverage, summarizeCoverage } from '../lib/handbook/coverage'

async function main() {
  const pages = await getAllPagesForAdmin()
  const rows = computeCoverage(pages)
  const s = summarizeCoverage(rows)

  console.log('=== SUMMARY ===')
  console.log(`pages       ${rows.length}   (expect 21)`)
  console.log(`covered     ${s.covered}  (expect 117)`)
  console.log(`intentional ${s.intentional}   (expect 25)`)
  console.log(`unreviewed  ${s.unreviewed}    (expect 5)`)
  console.log(`total       ${s.total}  (expect 147)`)
  console.log(`published   ${rows.filter((r) => r.isPublished).length} / ${rows.length}`)

  console.log('\n=== THE UNREVIEWED CELLS (expect Benefits/Equipment/SOP x ID,NO) ===')
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.state === 'UNREVIEWED') console.log(`  ${row.title}  x  ${cell.team}`)
    }
  }

  console.log('\n=== PER-TEAM VISIBLE PAGE COUNT (published & covered) ===')
  console.log('expected: PK 21, MA 20, CO 20, ID 15, NB 15, 3E-PK 13, 3E-MA 13')
  const teams = rows[0]?.cells.map((c) => c.team) ?? []
  for (const team of teams) {
    const n = rows.filter(
      (r) => r.isPublished && r.cells.find((c) => c.team === team)?.state === 'COVERED'
    ).length
    console.log(`  ${team.padEnd(18)} ${n}`)
  }

  // The invariant the reader depends on: no page may have two variants
  // claiming the same team.
  console.log('\n=== OVERLAP CHECK (must be none) ===')
  let overlaps = 0
  for (const p of pages) {
    const seen = new Set<string>()
    const clash = new Set<string>()
    for (const v of p.variants) {
      for (const t of v.audiences) {
        if (seen.has(t)) clash.add(t)
        seen.add(t)
      }
    }
    if (clash.size) {
      overlaps++
      console.log(`  OVERLAP ${p.slug}: ${[...clash].join(', ')}`)
    }
  }
  console.log(overlaps === 0 ? '  none -- correct' : `  ${overlaps} PAGES WITH OVERLAP`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
