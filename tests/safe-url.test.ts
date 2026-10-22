import assert from 'node:assert/strict'
import test from 'node:test'
import { imageUrlFromMarkdown, safeImageSrc, safeLinkHref } from '../lib/safe-url'

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

test('every value the helpers accept from markdown also passes the sink guard in TaskDetailPanel', () => {
  // Same pattern as SAFE_URL in components/projects/TaskDetailPanel.tsx.
  const SAFE_URL = /^(?:https?:\/\/|\/(?![/\\]))/i
  for (const value of [
    'https://example.com/a?b=1#c',
    'HTTP://Example.com',
    'www.example.com/page',
    '/api/projects/images/file?pathname=a%2Fb.png',
  ]) {
    const href = safeLinkHref(value)
    const src = safeImageSrc(value)
    assert.ok(href && SAFE_URL.test(href), value)
    assert.ok(src && SAFE_URL.test(src), value)
  }
})

test('imageUrlFromMarkdown returns the same URL as before for normal image markdown', () => {
  for (const [input, expected] of [
    ['https://cdn.example.com/a/b.png?w=200#x', 'https://cdn.example.com/a/b.png?w=200#x'],
    ['http://cdn.example.com/b.png', 'http://cdn.example.com/b.png'],
    ['www.example.com/img.png', 'https://www.example.com/img.png'],
    ['https://cdn.example.com:8443/a.png', 'https://cdn.example.com:8443/a.png'],
    ['https://cdn.example.com/a%20b.png', 'https://cdn.example.com/a%20b.png'],
    [
      '/api/projects/images/file?pathname=project-task-images%2Fp1%2F1700000000000-shot-AbC123.png',
      '/api/projects/images/file?pathname=project-task-images%2Fp1%2F1700000000000-shot-AbC123.png',
    ],
    ['/static/logo.png', '/static/logo.png'],
  ]) {
    assert.equal(imageUrlFromMarkdown(input), expected, input)
    // Same as the value rendered before this change.
    assert.equal(imageUrlFromMarkdown(input), safeImageSrc(input), input)
  }
})

test('imageUrlFromMarkdown round-trips upload pathnames with special characters', () => {
  const pathname = 'project-task-images/p 1/a+b&c=d#e.png'
  const raw = `/api/projects/images/file?pathname=${encodeURIComponent(pathname)}`
  assert.equal(imageUrlFromMarkdown(raw), raw)
})

test('imageUrlFromMarkdown normalises only cosmetic URL details (documented differences)', () => {
  assert.equal(imageUrlFromMarkdown('HTTPS://CDN.Example.com/A.png'), 'https://cdn.example.com/A.png')
  assert.equal(imageUrlFromMarkdown('https://cdn.example.com:443/a.png'), 'https://cdn.example.com/a.png')
  assert.equal(imageUrlFromMarkdown('https://user:pw@cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
})

test('imageUrlFromMarkdown rejects what safeImageSrc rejects', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//evil.example/a.png', '/\\evil.example/a.png', 'relative.png', '']) {
    assert.equal(imageUrlFromMarkdown(value), null, value)
  }
})
