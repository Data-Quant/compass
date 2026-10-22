import assert from 'node:assert/strict'
import test from 'node:test'
import { safeImageSrc, safeLinkHref } from '../lib/safe-url'

test('safeLinkHref returns http and https URLs exactly as written (old behaviour)', () => {
  assert.equal(safeLinkHref('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c')
  assert.equal(safeLinkHref('http://example.com'), 'http://example.com')
  assert.equal(safeLinkHref('https://example.com/a%20b/(x)'), 'https://example.com/a%20b/(x)')
  assert.equal(safeLinkHref('HTTPS://Example.com/x'), 'HTTPS://Example.com/x')
})

test('safeLinkHref upgrades bare www. hosts to https', () => {
  assert.equal(safeLinkHref('www.example.com/page'), 'https://www.example.com/page')
})

test('safeLinkHref allows same-origin root-relative paths (uploaded task images)', () => {
  assert.equal(
    safeLinkHref('/api/projects/images/file?pathname=a%2Fb.png'),
    '/api/projects/images/file?pathname=a%2Fb.png'
  )
})

test('safeLinkHref rejects dangerous and ambiguous values', () => {
  for (const value of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:a@b.com',
    '//evil.example/x',
    '/\\evil.example/x',
    '\\\\evil.example',
    'relative/path',
    'https://',
    '',
  ]) {
    assert.equal(safeLinkHref(value), null, value)
  }
})

test('safeImageSrc allows http, https and root-relative, nothing else', () => {
  assert.equal(safeImageSrc('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
  assert.equal(safeImageSrc('http://cdn.example.com/a.png'), 'http://cdn.example.com/a.png')
  assert.equal(safeImageSrc('/api/projects/images/file?pathname=x'), '/api/projects/images/file?pathname=x')
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//evil.example/a.png', 'blob:https://x/y']) {
    assert.equal(safeImageSrc(value), null, value)
  }
})
