import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanDisplayName,
  evidencePathPrefix,
  extensionOf,
  safeStorageName,
  sniffEvidenceMime,
  validateEvidenceContent,
  validateEvidenceMeta,
} from '../lib/security-checks/evidence'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])

test('extension allowlist: PNG, JPG/JPEG, PDF only', () => {
  assert.equal(extensionOf('Shot.PNG'), 'png')
  assert.equal(validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 10 }, 0, 3).ok, true)
  assert.equal(validateEvidenceMeta({ fileName: 'a.jpeg', contentType: 'image/jpeg', size: 10 }, 0, 3).ok, true)
  assert.equal(validateEvidenceMeta({ fileName: 'a.pdf', contentType: 'application/pdf', size: 10 }, 0, 3).ok, true)
  for (const name of ['a.gif', 'a.webp', 'a.exe', 'a.png.exe', 'noext']) {
    assert.equal(validateEvidenceMeta({ fileName: name, contentType: 'image/png', size: 10 }, 0, 3).ok, false, name)
  }
})

test('declared MIME must match the extension', () => {
  const result = validateEvidenceMeta({ fileName: 'a.png', contentType: 'application/pdf', size: 10 }, 0, 3)
  assert.equal(result.ok, false)
})

test('size must be between 1 byte and 10 MB', () => {
  assert.equal(validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 0 }, 0, 3).ok, false)
  assert.equal(validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 10 * 1024 * 1024 }, 0, 3).ok, true)
  assert.equal(validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 10 * 1024 * 1024 + 1 }, 0, 3).ok, false)
})

test('file count stays within the campaign limit', () => {
  assert.equal(validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 1 }, 2, 3).ok, true)
  const blocked = validateEvidenceMeta({ fileName: 'a.png', contentType: 'image/png', size: 1 }, 3, 3)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.match(blocked.error, /at most 3 files/)
})

test('content sniffing detects real formats and rejects disguised files', () => {
  assert.equal(sniffEvidenceMime(PNG), 'image/png')
  assert.equal(sniffEvidenceMime(JPG), 'image/jpeg')
  assert.equal(sniffEvidenceMime(PDF), 'application/pdf')
  assert.equal(sniffEvidenceMime(EXE), null)
  assert.equal(validateEvidenceContent('image/png', PNG), null)
  assert.match(validateEvidenceContent('image/png', PDF) ?? '', /do not match/)
  assert.match(validateEvidenceContent('application/pdf', EXE) ?? '', /not a valid/)
})

test('storage names and display names are sanitised', () => {
  assert.equal(safeStorageName('../../My Screen Shot!!.png'), 'my-screen-shot')
  assert.equal(safeStorageName('.png'), 'evidence')
  assert.equal(cleanDisplayName('C:\\fake\\path\\shot\u0000.png'), 'shot.png')
  assert.equal(evidencePathPrefix('t1', 's1'), 'security-evidence/t1/s1/')
})
