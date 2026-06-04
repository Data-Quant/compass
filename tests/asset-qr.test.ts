import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAssetLabelsPdfBuffer,
  getAssetScanPath,
  getAssetScanUrl,
} from '../lib/asset-qr'

test('asset QR scan path uses the permanent equipment ID', () => {
  assert.equal(getAssetScanPath('AST-000123'), '/assets/scan/AST-000123')
})

test('asset QR scan URL prefers the configured Compass app URL', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://compass.example.com/'

  try {
    assert.equal(
      getAssetScanUrl('AST-000123', 'https://preview.example.com'),
      'https://compass.example.com/assets/scan/AST-000123'
    )
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  }
})

test('asset QR label generator returns a PDF document', async () => {
  const pdf = await createAssetLabelsPdfBuffer(
    [
      {
        id: 'asset-1',
        equipmentId: 'AST-000123',
        assetName: 'MacBook Pro 14',
        category: 'Laptop',
        brand: 'Apple',
        model: 'M1 Pro',
        serialNumber: '1423556346',
      },
    ],
    'https://compass.example.com'
  )

  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.ok(pdf.length > 1_000)
})
