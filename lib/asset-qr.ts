import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

export interface AssetQrLabelItem {
  id: string
  equipmentId: string
  assetName: string
  category: string
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
}

const DEFAULT_APP_URL = 'http://localhost:3000'
const QR_SIZE = 512

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return trimTrailingSlash(withProtocol)
}

export function getCompassBaseUrl(origin?: string | null) {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeBaseUrl(process.env.VERCEL_URL) ||
    normalizeBaseUrl(origin) ||
    DEFAULT_APP_URL
  )
}

export function getAssetScanPath(equipmentId: string) {
  return `/assets/scan/${encodeURIComponent(equipmentId)}`
}

export function getAssetScanUrl(equipmentId: string, origin?: string | null) {
  return `${getCompassBaseUrl(origin)}${getAssetScanPath(equipmentId)}`
}

export async function createAssetQrPngBuffer(equipmentId: string, origin?: string | null) {
  return QRCode.toBuffer(getAssetScanUrl(equipmentId, origin), {
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

export async function createAssetLabelsPdfBuffer(
  assets: AssetQrLabelItem[],
  origin?: string | null
) {
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
      const qrBuffer = await createAssetQrPngBuffer(asset.equipmentId, origin)
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
      drawLabelText(doc, asset.assetName, textX, y + 20, textWidth, { height: 34 })

      doc.fillColor('#2563EB').font('Helvetica-Bold').fontSize(11)
      drawLabelText(doc, asset.equipmentId, textX, y + 60, textWidth)

      doc.fillColor('#4B5563').font('Helvetica').fontSize(8.5)
      drawLabelText(doc, meta || 'Equipment Asset', textX, y + 80, textWidth, { height: 24 })

      if (asset.serialNumber) {
        doc.fillColor('#6B7280').fontSize(7.5)
        drawLabelText(doc, `S/N ${asset.serialNumber}`, textX, y + 106, textWidth)
      }

      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      drawLabelText(doc, 'Compass Asset', x + 12, y + 124, labelWidth - 24)
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
