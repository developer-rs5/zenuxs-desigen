import {
  PROTOTYPE_DEVICES,
  type PrototypeDevice,
  type PrototypeDeviceColor,
  type PrototypeDeviceRotation
} from '@open-pencil/scene-graph'

export function getDeviceByName(name: string): PrototypeDevice | null {
  return PROTOTYPE_DEVICES.find((d) => d.name === name) ?? null
}

export interface DeviceGeometry {
  screenWidth: number
  screenHeight: number
  bezelWidth: number
  cornerRadius: number
  outsetSide: number
  outsetTop: number
  outsetBottom: number
  bodyWidth: number
  bodyHeight: number
  color: PrototypeDeviceColor | null
}

/**
 * Calculates dynamic bezel thickness and screen corner radius for a device.
 * Formula from FigCraft:
 * - MacBook Air: bezel = max(w * 0.025, 6), r = 0
 * - Desktop: bezel = max(w * 0.02, 6), r = 0
 * - iPad: bezel = max(w * 0.05, 8), r = w * 0.04
 * - Phone (default): bezel = max(w * 0.06, 6), r = w * 0.13
 */
export function calculateDeviceBezel(
  deviceName: string,
  uprightWidth: number
): { bezel: number; cornerRadius: number } {
  if (deviceName === 'MacBook Air') {
    return { bezel: Math.max(uprightWidth * 0.025, 6.0), cornerRadius: 0.0 }
  }
  if (deviceName === 'Desktop') {
    return { bezel: Math.max(uprightWidth * 0.02, 6.0), cornerRadius: 0.0 }
  }
  if (deviceName.startsWith('iPad')) {
    return { bezel: Math.max(uprightWidth * 0.05, 8.0), cornerRadius: uprightWidth * 0.04 }
  }
  // Phones
  return { bezel: Math.max(uprightWidth * 0.06, 6.0), cornerRadius: uprightWidth * 0.13 }
}

/**
 * How far a device's physical chassis body reaches past its screen.
 */
export function calculateDeviceBodyOutset(
  deviceName: string,
  screenWidth: number,
  screenHeight: number,
  isLandscape: boolean
): { side: number; top: number; bottom: number } {
  const uprightW = isLandscape ? screenHeight : screenWidth
  const { bezel: b } = calculateDeviceBezel(deviceName, uprightW)

  if (deviceName === 'MacBook Air') {
    return {
      side: b + uprightW * 0.08,
      top: b,
      bottom: b + Math.max(uprightW * 0.022, 6.0)
    }
  }
  if (deviceName === 'Desktop') {
    return {
      side: b,
      top: b,
      bottom: b + uprightW * 0.08 + 6.0
    }
  }
  if (isLandscape) {
    return { side: b, top: b + 3.0, bottom: b + 3.0 }
  }
  return { side: b + 3.0, top: b, bottom: b }
}

/**
 * Calculates complete geometry for rendering a device frame and placing screen content.
 */
export function resolveDeviceGeometry(
  deviceName: string,
  rotation: PrototypeDeviceRotation = 'portrait',
  colorName?: string
): DeviceGeometry | null {
  const device = getDeviceByName(deviceName)
  if (!device) return null

  const isLandscape = rotation === 'landscape' && device.rotates
  const sw = isLandscape ? device.height : device.width
  const sh = isLandscape ? device.width : device.height

  const uprightW = isLandscape ? sh : sw
  const { bezel, cornerRadius } = calculateDeviceBezel(device.name, uprightW)
  const outsets = calculateDeviceBodyOutset(device.name, sw, sh, isLandscape)

  const bodyWidth = sw + 2 * outsets.side
  const bodyHeight = sh + outsets.top + outsets.bottom

  const selectedColor =
    device.colors.find((c) => c.name.toLowerCase() === colorName?.toLowerCase()) ??
    device.colors[0] ??
    null

  return {
    screenWidth: sw,
    screenHeight: sh,
    bezelWidth: bezel,
    cornerRadius,
    outsetSide: outsets.side,
    outsetTop: outsets.top,
    outsetBottom: outsets.bottom,
    bodyWidth,
    bodyHeight,
    color: selectedColor
  }
}
