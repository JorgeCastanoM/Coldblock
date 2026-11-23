// Renders the same individual task-report PDF the Download button builds.
// pdfmake runs in Node here; the document definition is the one the browser uses.

import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { buildTaskReportDoc, reportFilename } from '../src/lib/taskReportDoc.js'
import {
  DEFAULT_PERIOD_DAYS,
  REPORT_SECTIONS,
  buildTeamReport,
  describeFilters,
  periodBounds,
  periodCaptions,
  sectionBlurb,
} from '../src/lib/taskReport.js'

const OPTIONS = {
  source: 'all',
  includeAutomated: false,
  sort: 'importance',
  periodDays: DEFAULT_PERIOD_DAYS,
}

const require = createRequire(import.meta.url)

function loadPdfMake() {
  const pdfMake = require('pdfmake')
  const fontDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto')
  pdfMake.setFonts({
    Roboto: {
      normal: path.join(fontDir, 'Roboto-Regular.ttf'),
      bold: path.join(fontDir, 'Roboto-Medium.ttf'),
      italics: path.join(fontDir, 'Roboto-Italic.ttf'),
      bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf'),
    },
  })
  // The document is self-contained. Fonts are the only files it may read.
  pdfMake.setLocalAccessPolicy((file) => {
    const relative = path.relative(fontDir, file)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })
  pdfMake.setUrlAccessPolicy(() => false)
  return pdfMake
}

function modelFor(report, entry, team, now) {
  const bounds = periodBounds(OPTIONS.periodDays, now)
  return {
    mode: 'person',
    people: [entry],
    totals: team.totals,
    filters: describeFilters(report, OPTIONS, entry.hiddenAutomated, now),
    captions: periodCaptions(bounds),
    blurbs: Object.fromEntries(REPORT_SECTIONS.map((section) => [section.key, sectionBlurb(section.key, bounds)])),
    generatedAt: now,
  }
}

const { values } = parseArgs({
  options: {
    report: { type: 'string' },
    recipients: { type: 'string' },
    out: { type: 'string' },
  },
})

if (!values.report || !values.recipients || !values.out) {
  throw new Error('Usage: node scripts/renderTaskReportPdfs.mjs --report <json> --recipients <json> --out <dir>')
}

const report = JSON.parse(await readFile(values.report, 'utf8'))
const request = JSON.parse(await readFile(values.recipients, 'utf8'))
const now = request.generatedAt ? new Date(request.generatedAt) : new Date()
const team = buildTeamReport(report, OPTIONS, now)
const pdfMake = await loadPdfMake()

await mkdir(values.out, { recursive: true })
const manifest = []

for (const recipient of request.recipients ?? []) {
  const entry = team.people.find((person) => person.person.key === recipient.key)
  if (!entry) {
    throw new Error(`No report row for ${recipient.email} (key ${recipient.key})`)
  }
  const model = modelFor(report, entry, team, now)
  const doc = buildTaskReportDoc(model, { generatedAt: now })
  const filename = reportFilename(model, now)
  const file = path.join(values.out, filename)
  await pdfMake.createPdf(doc).write(file)
  manifest.push({
    email: recipient.email,
    name: recipient.name,
    file,
    counts: entry.counts,
    olderOverdue: entry.olderOverdue,
    noDueDate: entry.noDueDate,
  })
}

await writeFile(path.join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 2))
