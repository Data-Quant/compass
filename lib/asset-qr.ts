import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { compassUrl } from '@/lib/compass-url'

export interface AssetQrLabelItem {
  id: string
  equipmentId: string
  assetName: string
  category: string
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  ownerName?: string | null
}

const QR_SIZE = 512

export function getAssetScanPath(equipmentId: string) {
  return `/assets/scan/${encodeURIComponent(equipmentId)}`
}

/** Printed labels must keep working: always Compass's own address, never the deployment the label was made on. */
export function getAssetScanUrl(equipmentId: string) {
  return compassUrl(getAssetScanPath(equipmentId))
}

export async function createAssetQrPngBuffer(equipmentId: string) {
  return QRCode.toBuffer(getAssetScanUrl(equipmentId), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: QR_SIZE,
    color: {
      dark: '#111827',
      light: '#FFFFFF',
    },
  })
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = []
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

function drawLabelText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: PDFKit.Mixins.TextOptions = {}
) {
  doc.text(text, x, y, {
    width,
    ellipsis: true,
    ...options,
  })
}

export async function createAssetLabelsPdfBuffer(assets: AssetQrLabelItem[]) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: false,
    info: {
      Title: 'Compass Asset QR Labels',
      Author: 'Compass',
    },
  })
  const done = collectPdf(doc)

  const margin = 36
  const columnGap = 18
  const rowGap = 18
  const columns = 2
  const rowsPerPage = 4
  const labelsPerPage = columns * rowsPerPage
  const pageWidth = doc.page.width
  const labelWidth = (pageWidth - margin * 2 - columnGap) / columns
  const labelHeight = 150
  const qrSize = 92

  try {
    for (let index = 0; index < assets.length; index += 1) {
      if (index > 0 && index % labelsPerPage === 0) {
        doc.addPage()
      }

      const asset = assets[index]
      const pageIndex = index % labelsPerPage
      const column = pageIndex % columns
      const row = Math.floor(pageIndex / columns)
      const x = margin + column * (labelWidth + columnGap)
      const y = margin + row * (labelHeight + rowGap)
      const qrBuffer = await createAssetQrPngBuffer(asset.equipmentId)
      const textX = x + qrSize + 22
      const textWidth = labelWidth - qrSize - 34
      const meta = [asset.category, asset.brand, asset.model].filter(Boolean).join(' / ')

      doc
        .roundedRect(x, y, labelWidth, labelHeight, 8)
        .lineWidth(0.75)
        .strokeColor('#D1D5DB')
        .stroke()

      doc.image(qrBuffer, x + 12, y + 22, { width: qrSize, height: qrSize })

      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
      drawLabelText(doc, asset.assetName, textX, y + 16, textWidth, { height: 30 })

      doc.fillColor('#2563EB').font('Helvetica-Bold').fontSize(11)
      drawLabelText(doc, asset.equipmentId, textX, y + 54, textWidth)

      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8)
      drawLabelText(doc, asset.ownerName ? asset.ownerName : 'Unassigned', textX, y + 72, textWidth)

      doc.fillColor('#4B5563').font('Helvetica').fontSize(8.5)
      drawLabelText(doc, meta || 'Equipment Asset', textX, y + 88, textWidth, { height: 22 })

      if (asset.serialNumber) {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(7.5)
        drawLabelText(doc, `S/N ${asset.serialNumber}`, textX, y + 110, textWidth)
      }

      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      drawLabelText(doc, 'Compass Asset', x + 12, y + 126, labelWidth - 24)
    }

    if (assets.length === 0) {
      doc.fillColor('#111827').font('Helvetica').fontSize(12)
      doc.text('No assets selected.', margin, margin)
    }

    doc.end()
  } catch (error) {
    doc.end()
    throw error
  }

  return done
}
