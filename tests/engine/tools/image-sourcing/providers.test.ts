import { describe, expect, test } from 'bun:test'

import {
  createLocalAssetProvider,
  createOpenverseProvider,
  createPexelsAssetProvider,
  createWikimediaProvider
} from '@open-pencil/core/tools'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('openverse provider', () => {
  test('maps results into normalized assets with license facts', async () => {
    const provider = createOpenverseProvider({
      fetchImpl: async () =>
        jsonResponse({
          result_count: 1,
          results: [
            {
              id: 'abc',
              title: 'Coffee',
              url: 'https://live.staticflickr.com/1/photo.jpg?utm_source=flickr',
              thumbnail: 'https://api.openverse.org/v1/images/abc/thumb/',
              creator: 'gorekun',
              license: 'by',
              license_version: '2.0',
              license_url: 'https://creativecommons.org/licenses/by/2.0/',
              foreign_landing_url: 'https://www.flickr.com/photos/1',
              width: 1024,
              height: 768,
              filesize: 12345,
              filetype: 'jpg',
              tags: [{ name: 'coffee' }],
              attribution: 'Coffee by gorekun is licensed under CC BY 2.0'
            }
          ]
        })
    })

    const results = await provider.search('coffee', { limit: 5 })
    expect(results).toHaveLength(1)
    const asset = results[0]
    expect(asset?.provider).toBe('openverse')
    expect(asset?.id).toBe('abc')
    expect(asset?.creator).toBe('gorekun')
    expect(asset?.width).toBe(1024)
    expect(asset?.height).toBe(768)
    expect(asset?.license).toBe('by')
    expect(asset?.commercialUse).toBe(true)
    expect(asset?.modificationAllowed).toBe(true)
    expect(asset?.requiresAttribution).toBe(true)
    expect(asset?.sourcePage).toBe('https://www.flickr.com/photos/1')
    // The tracking parameter must not survive into the download url.
    expect(asset?.url).toBe('https://live.staticflickr.com/1/photo.jpg')
  })

  test('asks for commercial and modification friendly licenses', async () => {
    let requested = ''
    const provider = createOpenverseProvider({
      fetchImpl: async (input) => {
        requested = String(input)
        return jsonResponse({ results: [] })
      }
    })
    await provider.search('coffee', {
      limit: 3,
      allowNonCommercial: false,
      requireModification: true
    })
    expect(requested).toContain('license_type=commercial%2Cmodification')
    expect(requested).toContain('mature=false')
  })

  test('marks non commercial licenses as not usable for commercial work', async () => {
    const provider = createOpenverseProvider({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            { id: 'nc', url: 'https://example.com/a.jpg', license: 'by-nc' },
            { id: 'nd', url: 'https://example.com/b.jpg', license: 'by-nd' },
            { id: 'cc0', url: 'https://example.com/c.jpg', license: 'cc0' }
          ]
        })
    })
    const results = await provider.search('coffee', { limit: 5 })
    expect(results[0]?.commercialUse).toBe(false)
    expect(results[1]?.modificationAllowed).toBe(false)
    expect(results[2]?.commercialUse).toBe(true)
    expect(results[2]?.requiresAttribution).toBe(false)
  })

  test('reports a provider failure', async () => {
    const provider = createOpenverseProvider({
      fetchImpl: async () => jsonResponse({}, 503)
    })
    await expect(provider.search('coffee', { limit: 3 })).rejects.toThrow(/503/)
  })
})

describe('wikimedia provider', () => {
  test('maps results with license and attribution metadata', async () => {
    const provider = createWikimediaProvider({
      fetchImpl: async () =>
        jsonResponse({
          query: {
            pages: {
              '107645': {
                pageid: 107645,
                title: 'File:A small cup of coffee.JPG',
                index: 1,
                imageinfo: [
                  {
                    url: 'https://upload.wikimedia.org/commons/4/45/coffee.JPG?utm_source=commons',
                    thumburl: 'https://thumb.wikimedia.org/coffee.jpg',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Coffee',
                    mime: 'image/jpeg',
                    size: 401623,
                    width: 1600,
                    height: 1200,
                    extmetadata: {
                      LicenseShortName: { value: 'CC BY-SA 2.0' },
                      License: { value: 'cc-by-sa-2.0' },
                      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/2.0' },
                      Artist: { value: '<a href="http://example.com">Julius Schorzman</a>' },
                      AttributionRequired: { value: 'true' },
                      UsageTerms: { value: 'Creative Commons Attribution-Share Alike 2.0' }
                    }
                  }
                ]
              }
            }
          }
        })
    })

    const results = await provider.search('coffee', { limit: 5 })
    expect(results).toHaveLength(1)
    const asset = results[0]
    expect(asset?.provider).toBe('wikimedia')
    expect(asset?.title).toBe('A small cup of coffee')
    expect(asset?.license).toBe('cc-by-sa-2.0')
    expect(asset?.commercialUse).toBe(true)
    expect(asset?.modificationAllowed).toBe(true)
    expect(asset?.requiresAttribution).toBe(true)
    expect(asset?.creator).toBe('Julius Schorzman')
    expect(asset?.attribution).toContain('Julius Schorzman')
    expect(asset?.url).toBe('https://upload.wikimedia.org/commons/4/45/coffee.JPG')
  })

  test('uses the public mediawiki api without credentials', async () => {
    let requested = ''
    const provider = createWikimediaProvider({
      fetchImpl: async (input) => {
        requested = String(input)
        return jsonResponse({ query: { pages: {} } })
      }
    })
    await provider.search('coffee', { limit: 4 })
    expect(requested).toContain('commons.wikimedia.org/w/api.php')
    expect(requested).toContain('action=query')
    expect(requested).toContain('gsrnamespace=6')
    expect(requested).toContain('format=json')
  })

  test('detects svg results', async () => {
    const provider = createWikimediaProvider({
      fetchImpl: async () =>
        jsonResponse({
          query: {
            pages: {
              '1': {
                pageid: 1,
                title: 'File:Maki-scooter-15.svg',
                imageinfo: [
                  { url: 'https://upload.wikimedia.org/scooter.svg', mime: 'image/svg+xml' }
                ]
              }
            }
          }
        })
    })
    const results = await provider.search('scooter', { limit: 3 })
    expect(results[0]?.kind).toBe('svg')
  })
})

describe('pexels provider', () => {
  test('is not eligible without a credential', async () => {
    const provider = createPexelsAssetProvider()
    expect(provider.isConfigured()).toBe(false)
    expect(await provider.search('coffee', { limit: 3 })).toEqual([])
  })
})

describe('local asset provider', () => {
  test('matches bundled illustrations by their tags', async () => {
    const provider = createLocalAssetProvider()
    const results = await provider.search('coffee cup', { limit: 3 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.id).toBe('coffee-cup')
    expect(results[0]?.kind).toBe('svg')
    expect(results[0]?.inlineSource).toContain('<svg')
    expect(results[0]?.commercialUse).toBe(true)
  })

  test('returns nothing for an unrelated query', async () => {
    const provider = createLocalAssetProvider()
    expect(await provider.search('zzzz unrelated subject', { limit: 3 })).toEqual([])
  })
})
