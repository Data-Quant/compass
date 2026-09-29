import test from 'node:test'
import assert from 'node:assert/strict'
import { renderQuestionsEmail } from '../lib/weekly/emails'

test('the Monday email counts new and open questions and links to the inbox', () => {
  const email = renderQuestionsEmail({ name: 'Ana', newCount: 2, openCount: 3, appUrl: 'https://compass.example/', reminder: false })
  assert.equal(email.subject, 'Your evaluation questions for this week')
  assert.match(email.html, /2 new questions/)
  assert.match(email.html, /3 open in total/)
  assert.match(email.html, /href="https:\/\/compass\.example\/evaluations\/weekly"/)
})

test('the Thursday reminder uses singular wording for one question', () => {
  const email = renderQuestionsEmail({ name: 'Ana', newCount: 0, openCount: 1, appUrl: 'https://compass.example', reminder: true })
  assert.equal(email.subject, 'Reminder: 1 evaluation question is waiting')
})

test('names are escaped', () => {
  const email = renderQuestionsEmail({ name: '<script>x</script>', newCount: 1, openCount: 1, appUrl: 'https://compass.example', reminder: false })
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
})
