import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { readListFile } from '../lib/weekly/list-import'

test('a small .xlsx that would unpack to something huge is refused before it is read', async () => {
  const zip = new JSZip()
  zip.file('xl/worksheets/sheet1.xml', 'a'.repeat(60 * 1024 * 1024))
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  assert.ok(bytes.byteLength < 2 * 1024 * 1024, 'it is small to upload')
  assert.equal(await readListFile({ name: 'lists.xlsx', bytes }), 'The file is too large once unpacked')
})

test('a .csv says which list columns it has, so a missing column removes nothing', async () => {
  const csv = (text: string) => ({ name: 'lists.csv', bytes: new TextEncoder().encode(text).buffer as ArrayBuffer })
  const read = await readListFile(csv('Name,Peer 1\nAna Torvik,Ben Okafor\n'))
  assert.ok(typeof read !== 'string')
  assert.deepEqual(read.columns, { leads: false, peers: true, reports: false })
})
