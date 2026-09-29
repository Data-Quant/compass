import test from 'node:test'
import assert from 'node:assert/strict'
import { checkEvidenceUpload, claimEvidenceError, detectEvidenceKind, isHttpUrl, MAX_EVIDENCE_BYTES, safeFileName } from '../lib/kpi/evidence'

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0x20)])

test('file kinds are detected from content, not just the name', () => {
  assert.equal(detectEvidenceKind('proof.pdf', bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), 'pdf')
  assert.equal(detectEvidenceKind('shot.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'png')
  assert.equal(detectEvidenceKind('shot.jpg', bytes(0xff, 0xd8, 0xff)), 'jpg')
  assert.equal(detectEvidenceKind('shot.webp', bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'webp')
  assert.equal(detectEvidenceKind('sheet.xlsx', bytes(0x50, 0x4b, 0x03, 0x04)), 'xlsx')
  assert.equal(detectEvidenceKind('letter.docx', bytes(0x50, 0x4b, 0x03, 0x04)), 'docx')
  assert.equal(detectEvidenceKind('archive.zip', bytes(0x50, 0x4b, 0x03, 0x04)), null)
  assert.equal(detectEvidenceKind('data.csv', new TextEncoder().encode('a,b\n1,2\n')), 'csv')
  assert.equal(detectEvidenceKind('fake.pdf', new TextEncoder().encode('MZ executable')), null)
  assert.equal(detectEvidenceKind('binary.csv', new Uint8Array([0x61, 0x00, 0x62])), null)
})

test('uploads are size-checked and renamed safely', () => {
  const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d)
  assert.deepEqual(checkEvidenceUpload('Q4 Report (final).PDF', pdf), { ok: true, kind: 'pdf', contentType: 'application/pdf', fileName: 'q4-report-final.pdf' })
  assert.deepEqual(checkEvidenceUpload('empty.pdf', new Uint8Array()), { ok: false, error: 'The file is empty' })
  const huge = new Uint8Array(MAX_EVIDENCE_BYTES + 1)
  huge.set([0x25, 0x50, 0x44, 0x46, 0x2d])
  assert.deepEqual(checkEvidenceUpload('huge.pdf', huge), { ok: false, error: 'Files must be 4 MB or smaller; link larger proof instead' })
  assert.equal(checkEvidenceUpload('tool.exe', bytes(0x4d, 0x5a)).ok, false)
  assert.equal(safeFileName('../../etc/passwd', 'csv'), 'passwd.csv')
  assert.equal(safeFileName('???.pdf', 'pdf'), 'evidence.pdf')
})

test('each evidence type needs its own proof before a claim', () => {
  assert.equal(claimEvidenceError('LINK', { url: 'https://drive.example/doc', reportedValue: null, fileCount: 0 }), null)
  assert.match(claimEvidenceError('LINK', { url: null, reportedValue: null, fileCount: 0 }) ?? '', /link/)
  assert.match(claimEvidenceError('LINK', { url: 'javascript:alert(1)', reportedValue: null, fileCount: 0 }) ?? '', /http/)
  assert.match(claimEvidenceError('DOCUMENT', { url: null, reportedValue: null, fileCount: 0 }) ?? '', /Upload/)
  assert.equal(claimEvidenceError('DOCUMENT', { url: null, reportedValue: null, fileCount: 1 }), null)
  assert.match(claimEvidenceError('NUMBER', { url: null, reportedValue: '  ', fileCount: 0 }) ?? '', /number/)
  assert.equal(claimEvidenceError('NUMBER', { url: null, reportedValue: '42', fileCount: 0 }), null)
  assert.equal(claimEvidenceError('CLIENT_CONFIRMATION', { url: 'https://mail.example/thread', reportedValue: null, fileCount: 0 }), null)
  assert.match(claimEvidenceError('CLIENT_CONFIRMATION', { url: null, reportedValue: null, fileCount: 0 }) ?? '', /client confirmation/)
  assert.equal(isHttpUrl('ftp://x.example'), false)
  assert.equal(isHttpUrl('https://x.example/a?b=1'), true)
})
