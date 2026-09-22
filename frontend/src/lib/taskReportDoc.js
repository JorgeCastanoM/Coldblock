// pdfmake document definition for the task report. Pure — no pdfmake import —
// so it can be built and rendered outside the browser to check the output.
// Renders the same model as the screen (lib/taskReport.js).

import { IMPORTANCE_LEVELS, importanceSvg } from './taskImportance.js'
import { REPORT_SECTIONS, emptySectionText } from './taskReport.js'
import { SOURCE_LABELS } from './tasks.js'

const SECTION_TITLES = Object.fromEntries(REPORT_SECTIONS.map((section) => [section.key, section.title]))

const INK = '#0f172a'
const MUTED = '#475569'
const SUBTLE = '#64748b'
const HAIRLINE = '#e2e8f0'
const RULE = '#cbd5e1'
const HEAD_FILL = '#f8fafc'
const TILE_FILL = '#f1f5f9'
const RED = '#dc2626'
const VIOLET = '#7c3aed'

const ACCENTS = {
  emerald: { color: '#059669', tint: '#ecfdf5' },
  red: { color: '#dc2626', tint: '#fef2f2' },
  sky: { color: '#0284c7', tint: '#f0f9ff' },
}

// Match the on-screen pills: HubSpot orange, Planner green.
const SOURCE_COLORS = { hubspot: '#ea580c', planner: '#16a34a' }

// Letter landscape: 792pt wide, less 36pt margins each side.
const CONTENT_WIDTH = 720

function dot(color, size = 6) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6" width="${size}" height="${size}"><circle cx="3" cy="3" r="3" fill="${color}"/></svg>`
}

function formatGenerated(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function reportFilename(model, generatedAt = new Date()) {
  const day = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, '0'),
    String(generatedAt.getDate()).padStart(2, '0'),
  ].join('-')
  const who =
    model.mode === 'team'
      ? 'Team'
      : String(model.people[0]?.person.name ?? 'Person')
          .normalize('NFKD')
          .replace(/\p{M}/gu, '')
          .replace(/[^A-Za-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'Person'
  return `ColdBlock-Task-Report-${who}-${day}.pdf`
}

function importanceCell(level) {
  const spec = IMPORTANCE_LEVELS[level]
  if (!spec) return { text: '' }
  return {
    columns: [
      { svg: importanceSvg(level, 9), width: 9, height: 9, margin: [0, 0.5, 0, 0] },
      { text: spec.label, width: '*', margin: [4, 0, 0, 0] },
    ],
  }
}

function creatorCell(row) {
  const stack = []
  const { creator } = row
  if (!creator) {
    stack.push({ text: '—', color: SUBTLE })
  } else if (creator.kind === 'person') {
    stack.push({ text: creator.label })
  } else {
    stack.push({ text: creator.label.toUpperCase(), fontSize: 6.5, bold: true, color: VIOLET, characterSpacing: 0.4 })
    if (creator.detail) stack.push({ text: creator.detail, fontSize: 7.3, color: SUBTLE, margin: [0, 1, 0, 0] })
  }
  if (row.sharedWith.length > 0) {
    stack.push({ text: `Shared with ${row.sharedWith.join(', ')}`, fontSize: 7.3, color: SUBTLE, margin: [0, 1.5, 0, 0] })
  }
  return { stack }
}

function dateCell(row) {
  const stack = [{ text: row.dateLabel }]
  if (row.note) {
    stack.push({
      text: row.note,
      fontSize: 7.3,
      bold: row.late,
      color: row.late ? RED : SUBTLE,
      margin: [0, 1.5, 0, 0],
    })
  }
  return { stack }
}

function sourceCell(source) {
  const color = SOURCE_COLORS[source] ?? SUBTLE
  return {
    columns: [
      { svg: dot(color), width: 6, height: 6, margin: [0, 2, 0, 0] },
      { text: SOURCE_LABELS[source] ?? source, color, bold: true, width: '*', margin: [4, 0, 0, 0] },
    ],
  }
}

function taskCell(row) {
  const stack = [{ text: row.name, bold: true }]
  if (row.context) stack.push({ text: row.context, fontSize: 7.3, color: SUBTLE, margin: [0, 1.5, 0, 0] })
  return { stack }
}

const th = (text, alignment = 'left') => ({
  text: text.toUpperCase(),
  fontSize: 6.8,
  bold: true,
  color: SUBTLE,
  characterSpacing: 0.5,
  alignment,
})

const sectionLayout = {
  hLineWidth: (i, node) => {
    if (i === 0 || i === 1) return 0
    if (i === 2) return 0.8
    return i === node.table.body.length ? 0.8 : 0.5
  },
  vLineWidth: () => 0,
  hLineColor: (i, node) => (i === 2 || i === node.table.body.length ? RULE : HAIRLINE),
  paddingLeft: (i) => (i === 0 ? 8 : 5),
  paddingRight: (i, node) => (i === node.table.widths.length - 1 ? 8 : 5),
  paddingTop: () => 5,
  paddingBottom: () => 5,
  fillColor: (rowIndex) => (rowIndex === 1 ? HEAD_FILL : null),
}

function sectionTable(section, rows, { blurb, personName }) {
  const accent = ACCENTS[section.accent] ?? ACCENTS.sky
  // In the team packet the person's name rides in the title row, so a section
  // that continues onto a new page still says whose it is.
  const title = personName ? `${personName} · ${section.title}` : section.title
  const titleRow = [
    {
      colSpan: 5,
      fillColor: accent.tint,
      columns: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: 13, r: 1.5, color: accent.color }], width: 10 },
        {
          width: '*',
          margin: [0, 1.5, 0, 0],
          text: [
            { text: title.toUpperCase(), bold: true, color: accent.color, characterSpacing: 0.7 },
            { text: blurb ? `    ${blurb}` : '', color: SUBTLE, fontSize: 7.5 },
          ],
        },
        { text: String(rows.length), bold: true, fontSize: 11, color: accent.color, alignment: 'right', width: 50 },
      ],
    },
    {},
    {},
    {},
    {},
  ]
  const headerRow = [th('Task'), th('Importance'), th('Assigned by'), th(section.dateHeader), th('Source')]
  const body =
    rows.length === 0
      ? [[{ colSpan: 5, text: emptySectionText(section.key), italics: true, color: SUBTLE }, {}, {}, {}, {}]]
      : rows.map((row) => [taskCell(row), importanceCell(row.importance), creatorCell(row), dateCell(row), sourceCell(row.source)])

  return {
    margin: [0, 12, 0, 0],
    table: {
      headerRows: 2,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: ['*', 66, 138, 76, 62],
      body: [titleRow, headerRow, ...body],
    },
    layout: sectionLayout,
  }
}

const tileLayout = {
  hLineWidth: () => 0,
  // White gutters between the tiles.
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 8),
  vLineColor: () => '#ffffff',
  fillColor: () => TILE_FILL,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
}

function tile(label, value, color, caption) {
  return {
    stack: [
      { text: label, fontSize: 7.5, color: MUTED },
      { text: String(value), fontSize: 17, bold: true, color, margin: [0, 2, 0, 0] },
      caption ? { text: caption, fontSize: 7, color: SUBTLE, margin: [0, 1, 0, 0] } : { text: '' },
    ],
  }
}

function priorityTile(openPriority) {
  const parts = ['urgent', 'high'].filter((level) => openPriority[level] > 0)
  const detail =
    parts.length === 0
      ? { text: 'None open', fontSize: 10, color: SUBTLE, margin: [0, 5, 0, 0] }
      : {
          margin: [0, 5, 0, 0],
          columns: parts.flatMap((level) => [
            { svg: importanceSvg(level, 10), width: 10, height: 10, margin: [0, 0.5, 0, 0] },
            { text: `${openPriority[level]} ${level}`, width: 'auto', margin: [4, 0, 12, 0], fontSize: 10, bold: true },
          ]),
        }
  return { stack: [{ text: 'Open priority', fontSize: 7.5, color: MUTED }, detail] }
}

function tilesRow(counts, openPriority, captions) {
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          tile('Completed', counts.done, ACCENTS.emerald.color, captions && captions.done),
          tile('Overdue', counts.overdue, ACCENTS.red.color, captions && `Due ${captions.overdue}`),
          tile(SECTION_TITLES.due_next_week, counts.due_next_week, ACCENTS.sky.color, captions && `Due ${captions.due_next_week}`),
          priorityTile(openPriority),
        ],
      ],
    },
    layout: tileLayout,
  }
}

function filtersBlock(filters) {
  return { text: filters.join('   ·   '), fontSize: 7.5, color: SUBTLE, margin: [0, 8, 0, 0] }
}

function personBlock(entry, model, { pageBreak } = {}) {
  const { person } = entry
  const meta = [person.email, person.sources.map((source) => SOURCE_LABELS[source] ?? source).join(' + ')]
    .filter(Boolean)
    .join('   ·   ')
  const notes = [
    entry.olderOverdue > 0 ? `${entry.olderOverdue} still overdue from before ${model.captions?.start ?? 'this period'}` : null,
    entry.hiddenAutomated > 0 ? `${entry.hiddenAutomated} automated HubSpot reminders not listed` : null,
    entry.noDueDate > 0 ? `${entry.noDueDate} open tasks without a due date not listed` : null,
  ].filter(Boolean)

  return {
    pageBreak,
    stack: [
      { text: person.name, fontSize: 16, bold: true },
      meta ? { text: meta, fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 10] } : { text: '', margin: [0, 0, 0, 10] },
      tilesRow(entry.counts, entry.openPriority, model.captions),
      model.mode === 'person' ? filtersBlock(model.filters) : { text: '' },
      notes.length ? { text: notes.join('   ·   '), fontSize: 7.5, color: SUBTLE, margin: [0, 3, 0, 0] } : { text: '' },
      ...REPORT_SECTIONS.map((section) =>
        sectionTable(section, entry.sections[section.key], {
          blurb: model.blurbs?.[section.key],
          personName: model.mode === 'team' ? person.name : null,
        }),
      ),
    ],
  }
}

function teamCover(model) {
  const num = (value, color) => ({ text: String(value), alignment: 'right', color: value ? color : SUBTLE, bold: Boolean(value) && color === RED })
  const rows = model.people.map((entry) => [
    { text: entry.person.name, bold: true },
    num(entry.counts.done, INK),
    num(entry.counts.overdue, RED),
    num(entry.counts.due_next_week, INK),
    num(entry.olderOverdue, MUTED),
    num(entry.openPriority.urgent, INK),
    num(entry.openPriority.high, INK),
  ])
  const totals = model.totals
  return {
    stack: [
      { text: 'Team summary', fontSize: 16, bold: true },
      { text: `${model.people.length} people · each person's report starts on a new page after this summary`, fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 10] },
      tilesRow(totals, totals, model.captions),
      filtersBlock(model.filters),
      {
        margin: [0, 14, 0, 0],
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', 66, 66, 96, 76, 60, 60],
          body: [
            [th('Person'), th('Completed', 'right'), th('Overdue', 'right'), th(SECTION_TITLES.due_next_week, 'right'), th('Older overdue', 'right'), th('Urgent open', 'right'), th('High open', 'right')],
            ...rows,
            [
              { text: 'Total', bold: true },
              { text: String(totals.done), alignment: 'right', bold: true },
              { text: String(totals.overdue), alignment: 'right', bold: true, color: RED },
              { text: String(totals.due_next_week), alignment: 'right', bold: true },
              { text: String(totals.olderOverdue), alignment: 'right', bold: true, color: MUTED },
              { text: String(totals.urgent), alignment: 'right', bold: true },
              { text: String(totals.high), alignment: 'right', bold: true },
            ],
          ],
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 ? 0 : i === 1 || i === node.table.body.length - 1 || i === node.table.body.length ? 0.8 : 0.5),
          vLineWidth: () => 0,
          hLineColor: (i, node) => (i === 1 || i >= node.table.body.length - 1 ? RULE : HAIRLINE),
          paddingLeft: (i) => (i === 0 ? 8 : 5),
          paddingRight: (i, node) => (i === node.table.widths.length - 1 ? 8 : 5),
          paddingTop: () => 5,
          paddingBottom: () => 5,
          fillColor: (rowIndex, node) => (rowIndex === 0 || rowIndex === node.table.body.length - 1 ? HEAD_FILL : null),
        },
      },
    ],
  }
}

/**
 * model: { mode: 'person' | 'team', people: [personReport], totals, filters: [string],
 *          blurbs: {sectionKey: string}, captions: periodCaptions(...) }
 * options: { logoDataUrl?, generatedAt: Date }
 */
export function buildTaskReportDoc(model, { logoDataUrl = null, generatedAt = new Date() } = {}) {
  const who = model.mode === 'team' ? 'Whole team' : model.people[0]?.person.name ?? ''
  const generated = `Generated ${formatGenerated(generatedAt)}`

  const content =
    model.mode === 'team'
      ? [teamCover(model), ...model.people.map((entry) => personBlock(entry, model, { pageBreak: 'before' }))]
      : model.people.map((entry) => personBlock(entry, model))

  return {
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: [36, 74, 36, 42],
    info: { title: `Task Report — ${who}`, author: 'ColdBlock Intelligence Dashboard', subject: 'Task report' },
    defaultStyle: { font: 'Roboto', fontSize: 8.6, color: INK, lineHeight: 1.12 },
    header: () => ({
      margin: [36, 20, 36, 0],
      stack: [
        {
          columns: [
            logoDataUrl
              ? { image: logoDataUrl, width: 96 }
              : { text: 'ColdBlock', bold: true, fontSize: 14, width: 96, margin: [0, 6, 0, 0] },
            {
              width: '*',
              margin: [14, 3, 0, 0],
              stack: [
                { text: `Task Report — ${who}`, fontSize: 13, bold: true },
                { text: 'ColdBlock Technologies · HubSpot + Microsoft Planner', fontSize: 7.5, color: SUBTLE, margin: [0, 2, 0, 0] },
              ],
            },
            { width: 'auto', text: generated, fontSize: 7.5, color: SUBTLE, alignment: 'right', margin: [0, 6, 0, 0] },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.6, lineColor: RULE }], margin: [0, 8, 0, 0] },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [36, 16, 36, 0],
      columns: [
        { text: `ColdBlock Intelligence Dashboard · ${generated}`, fontSize: 7, color: SUBTLE },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: SUBTLE, alignment: 'right' },
      ],
    }),
    content,
  }
}
