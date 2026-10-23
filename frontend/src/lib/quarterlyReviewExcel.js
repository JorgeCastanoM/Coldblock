import { REVIEW_STAGES, closeDateOf } from './quarterlyReview.js'
import { daysInCurrentStage } from './deals.js'

// Matches the light meeting worksheet palette.
const COLORS = {
  active_dialogue: ['F1E8FA', '7C3EAC'],
  confirmed_interest: ['E0F2FE', '0369A1'],
  in_purchasing: ['FFF3CC', '925A00'],
  closed_won: ['E2F4E8', '216E3E'],
}
const COLUMNS = [
  ['Account', 38], ['Unit', 25], ['Close date', 15], ['Transaction', 18],
  ['Approx $', 20], ['Channel', 21], ['Country', 18], ['Application', 23],
  ['Stage', 34], ['Days in stage', 18], ['Owner', 24],
  ['HubSpot next step', 38], ['Notes', 44],
]
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } })

export async function buildReviewWorkbook(groups, notes, year) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Coldblock'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(`Pipeline ${year}`, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1, zoomScale: 70 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true,
      fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
  })
  sheet.columns = COLUMNS.map(([header, width]) => ({ header, width }))
  sheet.getRow(1).height = 26
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = fill('111111')
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  const counts = new Map()
  for (const group of groups) {
    const heading = sheet.addRow([`${group.title}${group.subtitle ? ` · ${group.subtitle}` : ''} · ${group.rows.length} deals`])
    sheet.mergeCells(heading.number, 1, heading.number, COLUMNS.length)
    heading.height = 23
    heading.getCell(1).fill = fill('F3F4F6')
    heading.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
    for (const { deal, stageKey } of group.rows) {
      counts.set(stageKey, (counts.get(stageKey) ?? 0) + 1)
      const close = closeDateOf(deal)
      // Preserve the source calendar date in Excel regardless of timezone.
      const date = close ? new Date(Date.UTC(close.getFullYear(), close.getMonth(), close.getDate())) : null
      const row = sheet.addRow([
        deal.name || 'Untitled deal', (deal.expected_products ?? []).join(', '), date,
        deal.purchase_type ?? '—', deal.amount == null ? null : Number(deal.amount),
        deal.deal_type ?? '—', deal.country ?? '—', (deal.sectors ?? []).join(', '),
        deal.stage ?? '—', daysInCurrentStage(deal),
        deal.owner?.name ?? deal.owner?.email ?? 'Unassigned', deal.next_step ?? '',
        notes[deal.deal_id]?.text ?? '',
      ])
      const [background, accent] = COLORS[stageKey] ?? ['FFFFFF', '334155']
      let lines = 1
      row.eachCell({ includeEmpty: true }, (cell, index) => {
        cell.fill = fill(background)
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF111111' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } },
          right: { style: 'thin', color: { argb: 'FFD0D7DE' } } }
        const text = typeof cell.value === 'string' ? cell.value : ''
        const capacity = Math.max(10, COLUMNS[index - 1][1] - 3)
        lines = Math.max(lines, ...text.split('\n').map((line) => Math.max(1, Math.ceil(line.length / capacity))))
      })
      row.height = 16 * lines + 6
      row.getCell(1).border = { ...row.getCell(1).border, left: { style: 'medium', color: { argb: `FF${accent}` } } }
      row.getCell(3).numFmt = 'mmm d, yyyy'
      const currency = String(deal.currency || 'USD').replace(/[^A-Za-z]/g, '').toUpperCase()
      row.getCell(5).numFmt = `"$"#,##0" ${currency}"`
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(10).numFmt = '0'
      row.getCell(9).font = { name: 'Calibri', size: 11, bold: true, color: { argb: `FF${accent}` } }
    }
  }
  sheet.addRow([])
  const legend = sheet.addRow(['STAGE KEY', 'Visible deals'])
  legend.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
  for (const stage of REVIEW_STAGES) {
    const row = sheet.addRow([stage.label, counts.get(stage.key) ?? 0])
    const [background, accent] = COLORS[stage.key]
    for (const index of [1, 2]) {
      row.getCell(index).fill = fill(background)
      row.getCell(index).font = { name: 'Calibri', size: 11, bold: true, color: { argb: `FF${accent}` } }
    }
    row.height = 21
  }
  sheet.addRow([`Exported ${new Date().toISOString().slice(0, 10)}. Days in stage are a snapshot. Notes are from this browser.`])
  sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, COLUMNS.length)
  sheet.getRow(sheet.rowCount).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } }
  return workbook
}

export async function downloadReviewExcel(groups, notes, year, scope) {
  const workbook = await buildReviewWorkbook(groups, notes, year)
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const link = document.createElement('a')
  link.href = url
  link.download = `quarterly-pipeline-${year}-${scope}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
