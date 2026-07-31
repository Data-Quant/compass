import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectProjectImageMimeType,
  isProjectImageMimeType,
  projectImageExtension,
} from '../lib/project-image-validation'

test('project images accept only verified raster formats', () => {
  assert.equal(detectProjectImageMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectProjectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('GIF89a')), 'image/gif')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('<svg onload="alert(1)">')), null)
  assert.equal(isProjectImageMimeType('image/svg+xml'), false)
  assert.equal(projectImageExtension('image/jpeg'), 'jpg')
})
