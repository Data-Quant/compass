import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseEvaluationWorkbook } from '../lib/workbook-import'

function toArrayBuffer(buffer: Buffer | Uint8Array | ArrayBuffer) {
  if (buffer instanceof ArrayBuffer) {
    return buffer
  }

  const view = buffer instanceof Buffer ? buffer : Buffer.from(buffer)
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
}

test('parseEvaluationWorkbook reads Sheet1 mappings and Sheet2 profiles from xlsx uploads', async () => {
  const workbook = new ExcelJS.Workbook()

  const mappingSheet = workbook.addWorksheet('Sheet1')
  mappingSheet.addRow([
    'Name',
    'Team Lead 1',
    'Peer 1',
    'Reporting Team Member 1',
  ])
  mappingSheet.addRow([
    'Fakaya Jamil',
    'Brad Herman',
    'Noha Hamraoui',
    'Saman Fahim',
  ])

  const profileSheet = workbook.addWorksheet('Sheet2')
  profileSheet.addRow([
    'Profile',
    'Dept',
    'Team Lead',
    'C suite (Hamiz)',
    'Peer',
    'Reporting TMs',
    'HR',
    'Members',
  ])
  profileSheet.addRow([
    'Profile 1',
    0.45,
    0.45,
    0,
    0,
    0,
    0.10,
    'FakayhaJamil',
  ])

  const buffer = await workbook.xlsx.writeBuffer()
  const parsed = await parseEvaluationWorkbook(toArrayBuffer(buffer))

  assert.equal(parsed.mappingRows.length, 1)
  assert.equal(parsed.mappingRows[0].Name, 'Fakayha Jamil')
  assert.equal(parsed.mappingRows[0]['Team Lead 1'], 'Brad Herman')

  assert.equal(parsed.profileDefinitions.length, 1)
  assert.equal(parsed.profileDefinitions[0].categorySetKey, 'DEPT,HR,TEAM_LEAD')
  assert.deepEqual(parsed.profileDefinitions[0].expectedMembers, ['Fakayha Jamil'])
})
