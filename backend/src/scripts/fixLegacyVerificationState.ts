import { closeDb, getDb } from '../models/database.js'

type LegacyNewsRow = {
  id: number
  title: string
  verified: number | null
  verifyConfidence: number
  verifyWarnings: string
}

const LEGACY_WARNING = 'AI验证不可用，无法确认真实性'

function hasLegacyFallbackWarning(rawWarnings: string): boolean {
  try {
    const warnings = JSON.parse(rawWarnings) as unknown
    return Array.isArray(warnings) && warnings.some((warning) => String(warning).trim() === LEGACY_WARNING)
  } catch {
    return rawWarnings.includes(LEGACY_WARNING)
  }
}

function main() {
  const shouldApply = process.argv.includes('--apply')
  const db = getDb()

  const candidates = db.prepare(`
    SELECT id, title, verified, verifyConfidence, verifyWarnings
    FROM news
    WHERE verified = 1
      AND verifyConfidence = 0.5
      AND verifyWarnings LIKE ?
    ORDER BY id ASC
  `).all(`%${LEGACY_WARNING}%`) as LegacyNewsRow[]

  const targetRows = candidates.filter((row) => hasLegacyFallbackWarning(row.verifyWarnings))

  console.log(`[legacy-verification-fix] scanned ${candidates.length} candidate rows, matched ${targetRows.length} rows.`)

  if (targetRows.length === 0) {
    console.log('[legacy-verification-fix] no legacy records need repair.')
    closeDb()
    return
  }

  for (const row of targetRows.slice(0, 20)) {
    console.log(`- #${row.id} ${row.title}`)
  }

  if (targetRows.length > 20) {
    console.log(`... and ${targetRows.length - 20} more rows.`)
  }

  if (!shouldApply) {
    console.log('[legacy-verification-fix] dry run only. Re-run with --apply to update these rows to 待验证.')
    closeDb()
    return
  }

  const updateStatement = db.prepare(`
    UPDATE news
    SET verified = NULL,
        verifyConfidence = 0
    WHERE id = ?
  `)

  const transaction = db.transaction((rows: LegacyNewsRow[]) => {
    for (const row of rows) {
      updateStatement.run(row.id)
    }
  })

  transaction(targetRows)

  console.log(`[legacy-verification-fix] updated ${targetRows.length} rows.`)
  closeDb()
}

main()