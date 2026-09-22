// Browser side of the PDF export. pdfmake (~1.5 MB with its fonts) is loaded
// only when someone clicks Download, so it never weighs on a normal page load.
// Its bundled Roboto covers Cyrillic, which some task names in this portal use.

import { buildTaskReportDoc, reportFilename } from './taskReportDoc.js'

let pdfMakeReady = null

function loadPdfMake() {
  if (!pdfMakeReady) {
    pdfMakeReady = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(
      ([pdfMakeModule, fontsModule]) => {
        const pdfMake = pdfMakeModule.default ?? pdfMakeModule
        pdfMake.addVirtualFileSystem(fontsModule.default ?? fontsModule)
        return pdfMake
      },
    )
    // Let a failed load (e.g. a dropped connection) be retried on the next click.
    pdfMakeReady.catch(() => {
      pdfMakeReady = null
    })
  }
  return pdfMakeReady
}

let logoReady = null

/**
 * The header logo as a PNG data URL. pdfmake can't read WebP, so it's redrawn
 * through a canvas, on the same dark plate the app header gives it.
 */
function loadLogo() {
  if (!logoReady) {
    logoReady = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => {
        const pad = 14
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth + pad * 2
        canvas.height = image.naturalHeight + pad * 2
        const context = canvas.getContext('2d')
        context.fillStyle = '#0f172a'
        context.beginPath()
        if (context.roundRect) context.roundRect(0, 0, canvas.width, canvas.height, 14)
        else context.rect(0, 0, canvas.width, canvas.height)
        context.fill()
        context.drawImage(image, pad, pad)
        resolve(canvas.toDataURL('image/png'))
      }
      // No logo is better than no PDF.
      image.onerror = () => resolve(null)
      image.src = '/Coldblock_Logo.webp'
    })
  }
  return logoReady
}

export async function createTaskReportPdf(model) {
  const [pdfMake, logoDataUrl] = await Promise.all([loadPdfMake(), loadLogo()])
  const doc = buildTaskReportDoc(model, { logoDataUrl, generatedAt: model.generatedAt ?? new Date() })
  return pdfMake.createPdf(doc)
}

export async function downloadTaskReportPdf(model) {
  const pdf = await createTaskReportPdf(model)
  await pdf.download(reportFilename(model, model.generatedAt ?? new Date()))
}
