import { describe, expect, test } from 'bun:test'

import {
  calculateDeviceBezel,
  calculateDeviceBodyOutset,
  getDeviceByName,
  resolveDeviceGeometry
} from '@open-pencil/core'
import { PROTOTYPE_DEVICES } from '@open-pencil/scene-graph'

describe('Device frames and bezels', () => {
  test('includes 19 standard devices from FigCraft', () => {
    expect(PROTOTYPE_DEVICES.length).toBe(19)
    expect(getDeviceByName('iPhone 17')).toBeDefined()
    expect(getDeviceByName('iPhone 16 Pro')).toBeDefined()
    expect(getDeviceByName('MacBook Air')).toBeDefined()
    expect(getDeviceByName('Desktop')).toBeDefined()
  })

  test('calculates correct bezel ratios per device family', () => {
    const phone = calculateDeviceBezel('iPhone 16', 393)
    expect(phone.bezel).toBeCloseTo(393 * 0.06, 1)
    expect(phone.cornerRadius).toBeCloseTo(393 * 0.13, 1)

    const macbook = calculateDeviceBezel('MacBook Air', 1280)
    expect(macbook.cornerRadius).toBe(0)
    expect(macbook.bezel).toBeCloseTo(1280 * 0.025, 1)

    const ipad = calculateDeviceBezel('iPad mini', 744)
    expect(ipad.bezel).toBeCloseTo(744 * 0.05, 1)
    expect(ipad.cornerRadius).toBeCloseTo(744 * 0.04, 1)
  })

  test('resolves full device geometry with chassis body and orientation', () => {
    const portrait = resolveDeviceGeometry('iPhone 16', 'portrait')
    expect(portrait).toBeDefined()
    expect(portrait?.screenWidth).toBe(393)
    expect(portrait?.screenHeight).toBe(852)
    expect(portrait?.bodyWidth).toBeGreaterThan(393)
    expect(portrait?.bodyHeight).toBeGreaterThan(852)

    const landscape = resolveDeviceGeometry('iPhone 16', 'landscape')
    expect(landscape).toBeDefined()
    expect(landscape?.screenWidth).toBe(852)
    expect(landscape?.screenHeight).toBe(393)
  })
})
