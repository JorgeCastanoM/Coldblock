import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { buildReviewWorkbook } from './quarterlyReviewExcel.js'

test('Excel export preserves meeting colors, filtered row order, values and notes after reopening', async () => {
  const stages = ['in_purchasing', 'active_dialogue', 'closed_won', 'confirmed_interest']
  const rows = stages.map((stageKey, index) => ({
    stageKey,
    deal: {
      deal_id: String(index), name: `Deal ${index}`, stage: stageKey,
      amount: index === 0 ? 0 : 12500.5, currency: index === 1 ? 'CAD' : 'USD',
      close_date: '2026-11-12T12:00:00Z', expected_products: ['CBM', 'Liners'],
      owner: { name: 'Owner' }, next_step: '=literal text',
    },
  }))
  const workbook = await buildReviewWorkbook(
    [{ title: 'Q4 2026', rows }], { 0: { text: 'Meeting note\nSecond line' } }, 2026,
  )
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer())
  const sheet = reopened.getWorksheet('Pipeline 2026')
  assert.equal(sheet.getCell('A1').value, 'Account')
  assert.equal(sheet.getCell('A1').fill.fgColor.argb, 'FF111111')
  assert.equal(sheet.getCell('A3').value, 'Deal 0')
  assert.equal(sheet.getCell('E3').value, 0)
  assert.equal(sheet.getCell('E4').value, 12500.5)
  assert.match(sheet.getCell('E4').numFmt, /CAD/)
  assert.equal(sheet.getCell('C3').value.toISOString(), '2026-11-12T00:00:00.000Z')
  assert.equal(sheet.getCell('J3').value, null)
  assert.equal(sheet.getCell('L3').value, '=literal text')
  assert.equal(sheet.getCell('M3').value, 'Meeting note\nSecond line')
  for (const [index, background] of ['FFF3CC', 'F1E8FA', 'E2F4E8', 'E0F2FE'].entries()) {
    assert.ok(sheet.getCell(`A${index + 3}`).fill.fgColor.argb.endsWith(background))
  }
  assert.equal(sheet.views[0].xSplit, 1)
  assert.equal(sheet.views[0].ySplit, 1)
  assert.equal(sheet.getCell('A8').value, 'STAGE KEY')
  assert.equal(sheet.getCell('B9').value, 1)
})
