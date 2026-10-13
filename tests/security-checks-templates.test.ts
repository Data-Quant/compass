import test from 'node:test'
import assert from 'node:assert/strict'
import { activationIssues, campaignFieldsSchema, definitionIssues, videoUrlError } from '../lib/security-checks/schemas'
import { CAMPAIGN_TEMPLATES, templateFields } from '../lib/security-checks/templates'
import { csvCell, toCsv } from '../lib/security-checks/csv'
import { subtaskCompletionProblems, isSubtaskEditable, canRequestNa } from '../lib/security-checks/submission'

const audience = { all: true, departments: [], teams: [], userIds: [], excludeUserIds: [] }

test('every v1 template is a valid, activatable campaign definition', () => {
  assert.equal(new Set(CAMPAIGN_TEMPLATES.map((t) => t.key)).size, CAMPAIGN_TEMPLATES.length)
  for (const template of CAMPAIGN_TEMPLATES) {
    const fields = campaignFieldsSchema.parse({ ...templateFields(template), audience, firstOpenDate: '2026-11-01' })
    assert.deepEqual(activationIssues(fields, '2026-10-13'), [], template.key)
  }
})

test('confirmation-only templates take no evidence; the mobile inventory raises the file limit', () => {
  const confirmations = CAMPAIGN_TEMPLATES.filter((t) => !t.evidenceRequired)
  assert.equal(confirmations.length, 4)
  assert.equal(CAMPAIGN_TEMPLATES.find((t) => t.key === 'mobile-inventory')?.fileLimit, 15)
})

const base = { ...templateFields(CAMPAIGN_TEMPLATES[0]), audience, firstOpenDate: '2026-11-01' }

test('activation needs content, an audience and a first open date that is not in the past', () => {
  const empty = { ...base, questions: [], subtaskMode: 'NONE' as const, subtasks: [] }
  assert.match(activationIssues(empty, '2026-10-13').join(' '), /at least one question/)
  assert.match(activationIssues({ ...base, audience: { ...audience, all: false } }, '2026-10-13').join(' '), /audience/)
  assert.match(activationIssues({ ...base, firstOpenDate: '2026-10-01' }, '2026-10-13').join(' '), /past/)
  const employeeDefined = { ...empty, subtaskMode: 'EMPLOYEE_DEFINED' as const }
  assert.deepEqual(activationIssues(employeeDefined, '2026-10-13'), [])
})

test('definition rules: compliant answers, unique subtasks, 20-subtask cap incl. declaration, frequency fit', () => {
  assert.match(definitionIssues({ ...base, questions: [{ type: 'YES_NO', prompt: 'Q?', compliantAnswer: null }] }).join(' '), /compliant answer/)
  assert.match(definitionIssues({ ...base, subtaskMode: 'ADMIN_DEFINED', subtasks: ['A', 'a'] }).join(' '), /unique/)
  const twenty = Array.from({ length: 20 }, (_, i) => `S${i}`)
  assert.deepEqual(definitionIssues({ ...base, subtaskMode: 'ADMIN_DEFINED', subtasks: twenty }), [])
  assert.match(definitionIssues({ ...base, frequency: 'QUARTERLY', deadlineDays: 90 }).join(' '), /too long/)
})

test('video links must be https Google Drive, inside the designated folder when configured', () => {
  assert.equal(videoUrlError('https://drive.google.com/drive/folders/abc', 'abc'), null)
  assert.match(videoUrlError('https://drive.google.com/drive/folders/other', 'abc') ?? '', /designated/)
  assert.match(videoUrlError('https://evil.example/drive.google.com', undefined) ?? '', /Google Drive/)
  assert.match(videoUrlError('not a url', undefined) ?? '', /valid URL/)
})

test('CSV cells are quoted and neutralise spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell(null), '')
  assert.equal(toCsv(['A', 'B'], [[1, '@x']]), "A,B\r\n1,'@x")
})

test('submission completeness: declaration, N/A justification, answers and evidence', () => {
  const q = [{ id: 'q1', type: 'YES_NO' as const, prompt: 'On?', compliantAnswer: true }]
  const subtask = { name: 'GitHub', source: 'ADMIN' as const, answers: {}, declarationConfirmed: false, naRequested: false, naJustification: null, activeFileCount: 0 }
  assert.equal(subtaskCompletionProblems(subtask, q, true).length, 2)
  assert.deepEqual(subtaskCompletionProblems({ ...subtask, answers: { q1: false }, activeFileCount: 1 }, q, true), [])
  assert.equal(subtaskCompletionProblems({ ...subtask, naRequested: true, naJustification: 'no' }, q, true).length, 1)
  assert.deepEqual(subtaskCompletionProblems({ ...subtask, naRequested: true, naJustification: 'No account' }, q, true), [])
  assert.equal(subtaskCompletionProblems({ ...subtask, source: 'DECLARATION', name: 'Declaration' }, [], true).length, 1)
})

test('only the current round is editable; denied N/A cannot be re-requested', () => {
  assert.ok(isSubtaskEditable('IN_PROGRESS', 'OPEN'))
  assert.ok(!isSubtaskEditable('REJECTED', 'VERIFIED'))
  assert.ok(isSubtaskEditable('REQUIRES_INFO', 'REQUIRES_INFO'))
  assert.ok(!isSubtaskEditable('PENDING_REVIEW', 'PENDING_REVIEW'))
  assert.ok(!canRequestNa({ source: 'ADMIN', lastVerdict: 'DENY_NA' }))
  assert.ok(!canRequestNa({ source: 'TASK', lastVerdict: null }))
  assert.ok(canRequestNa({ source: 'EMPLOYEE', lastVerdict: 'REJECT' }))
})

test('retention settings: audit log has a 12-month floor and outlives evidence and attestations', async () => {
  const { retentionSettingsError } = await import('../lib/security-checks/service/retention')
  assert.equal(retentionSettingsError({ evidenceRetentionMonths: 12, attestationRetentionMonths: 36, auditRetentionMonths: 36 }), null)
  assert.match(retentionSettingsError({ evidenceRetentionMonths: 12, attestationRetentionMonths: 36, auditRetentionMonths: 1 }) ?? '', /at least 12/)
  assert.match(retentionSettingsError({ evidenceRetentionMonths: 12, attestationRetentionMonths: 36, auditRetentionMonths: 24 }) ?? '', /cannot be shorter/)
  assert.match(retentionSettingsError({ evidenceRetentionMonths: 24, attestationRetentionMonths: 12, auditRetentionMonths: 36 }) ?? '', /less time than evidence/)
})
