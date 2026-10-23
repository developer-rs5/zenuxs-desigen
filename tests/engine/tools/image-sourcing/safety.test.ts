import { describe, expect, test } from 'bun:test'

import {
  canonicalizeURL,
  isAllowedImageContentType,
  isPrivateHostname,
  looksLikeSVG,
  sanitizeSVG,
  validateRemoteURL
} from '@open-pencil/core/tools'

describe('validateRemoteURL', () => {
  test('accepts public https and http urls', () => {
    expect(validateRemoteURL('https://cdn.example.com/a.png').hostname).toBe('cdn.example.com')
    expect(validateRemoteURL('http://images.example.org/a.png').protocol).toBe('http:')
  })

  test('rejects non http schemes', () => {
    expect(() => validateRemoteURL('file:///etc/passwd')).toThrow(/scheme/i)
    // The script scheme is assembled so the linter does not flag the literal.
    expect(() => validateRemoteURL(`java${'script'}:alert(1)`)).toThrow(/scheme/i)
    expect(() => validateRemoteURL('data:image/png;base64,AAAA')).toThrow(/scheme/i)
  })

  test('rejects private and loopback addresses', () => {
    for (const url of [
      'http://127.0.0.1/a.png',
      'http://localhost/a.png',
      'http://10.1.2.3/a.png',
      'http://192.168.0.5/a.png',
      'http://172.16.5.4/a.png',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/a.png',
      'http://intranet/a.png'
    ]) {
      expect(() => validateRemoteURL(url)).toThrow()
    }
  })

  test('rejects credentials in the url', () => {
    expect(() => validateRemoteURL('https://user:pass@cdn.example.com/a.png')).toThrow(
      /credential/i
    )
  })

  test('honours the host allowlist', () => {
    expect(() =>
      validateRemoteURL('https://evil.example.net/a.png', { allowedHosts: ['pexels.com'] })
    ).toThrow(/not allowed/i)
    expect(
      validateRemoteURL('https://images.pexels.com/a.png', { allowedHosts: ['pexels.com'] })
        .hostname
    ).toBe('images.pexels.com')
  })

  test('honours the host blocklist', () => {
    expect(() =>
      validateRemoteURL('https://tracker.example.net/a.png', { blockedHosts: ['example.net'] })
    ).toThrow(/blocked/i)
  })
})

describe('isPrivateHostname', () => {
  test('detects private ranges', () => {
    expect(isPrivateHostname('127.0.0.1')).toBe(true)
    expect(isPrivateHostname('10.0.0.1')).toBe(true)
    expect(isPrivateHostname('192.168.1.1')).toBe(true)
    expect(isPrivateHostname('169.254.169.254')).toBe(true)
    expect(isPrivateHostname('localhost')).toBe(true)
    expect(isPrivateHostname('printer.local')).toBe(true)
    expect(isPrivateHostname('box.internal')).toBe(true)
    expect(isPrivateHostname('cdn.example.com')).toBe(false)
  })
})

describe('isAllowedImageContentType', () => {
  test('accepts image types and rejects everything else', () => {
    expect(isAllowedImageContentType('image/png')).toBe(true)
    expect(isAllowedImageContentType('image/jpeg; charset=binary')).toBe(true)
    expect(isAllowedImageContentType('image/svg+xml')).toBe(true)
    expect(isAllowedImageContentType('text/html')).toBe(false)
    expect(isAllowedImageContentType('application/pdf')).toBe(false)
    expect(isAllowedImageContentType(null)).toBe(false)
  })
})

describe('canonicalizeURL', () => {
  test('removes tracking parameters', () => {
    expect(
      canonicalizeURL('https://cdn.example.com/a.png?utm_source=commons&utm_medium=x&keep=1')
    ).toBe('https://cdn.example.com/a.png?keep=1')
  })
})

describe('looksLikeSVG', () => {
  test('detects svg documents', () => {
    expect(
      looksLikeSVG(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    ).toBe(true)
    expect(looksLikeSVG(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })
})

describe('sanitizeSVG', () => {
  test('removes scripts and event handlers', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(2)</script>
      <rect width="10" height="10" onclick="alert(3)" fill="#fff" />
    </svg>`
    const clean = sanitizeSVG(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('onload')
    expect(clean).not.toContain('onclick')
    expect(clean).toContain('<rect')
  })

  test('removes external resource references', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <image href="https://evil.example.com/tracker.png" width="10" height="10" />
      <use xlink:href="https://evil.example.com/x.svg#icon" />
    </svg>`
    const clean = sanitizeSVG(dirty)
    expect(clean).not.toContain('evil.example.com')
  })

  test('keeps local fragment references', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg"><use href="#icon" /></svg>`
    expect(sanitizeSVG(source)).toContain('#icon')
  })

  test('removes foreignObject and embedded frames', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>hi</body></foreignObject></svg>`
    expect(sanitizeSVG(dirty)).not.toContain('foreignObject')
  })

  test('rejects entity declarations', () => {
    const dirty = `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>`
    expect(() => sanitizeSVG(dirty)).toThrow(/entity/i)
  })

  test('rejects markup that is not an svg root', () => {
    expect(() => sanitizeSVG('<html><body>nope</body></html>')).toThrow()
  })
})
