/**
 * Decomposing and composing the 2×3 node transforms the design panel shows as
 * X, Y and rotation. (Converted 1:1 from FigCraft `crates/geom/src/transform.rs`.)
 */

import { Affine, Point, Vec2Math, type Vec2 } from './kurbo'

/** Rotation in degrees (counter-clockwise on screen, as Figma's rotation field shows it). */
export function rotation_degrees(xf: Affine): number {
  const [a, b] = xf.coeffs
  // y-down: positive Figma rotation turns counter-clockwise on screen, i.e. a negative math angle.
  let deg = (-Math.atan2(b, a) * 180) / Math.PI
  deg = Math.abs(deg) < 1e-9 ? 0 : deg
  return deg <= -180 ? deg + 360 : deg
}

/** The translation part of `xf`. */
export function translation(xf: Affine): Point {
  return Point.new(xf.coeffs[4], xf.coeffs[5])
}

/** Replace the translation of `xf`. */
export function with_translation(xf: Affine, p: Point): Affine {
  const c = xf.coeffs
  return Affine.new([c[0], c[1], c[2], c[3], p.x, p.y])
}

/** Whether the linear part is a mirror (negative determinant). */
export function is_flipped(xf: Affine): boolean {
  return Affine.determinant(xf) < 0
}

/** A transform with the given translation and rotation (degrees, Figma convention). */
export function from_position_rotation(x: number, y: number, degrees: number): Affine {
  return Affine.mul(
    Affine.translate(Vec2Math.new(x, y)),
    Affine.rotate((-degrees * Math.PI) / 180)
  )
}

/**
 * Change the rotation of `xf` to `degrees` about the centre of a `w`×`h` box
 * in its local space, keeping that centre in place and keeping any flip.
 */
export function set_rotation_about_center(xf: Affine, w: number, h: number, degrees: number): Affine {
  const center_local = Point.new(w / 2, h / 2)
  const center = Affine.apply(xf, center_local)
  const flip = is_flipped(xf) ? Affine.FLIP_Y : Affine.IDENTITY
  const rot = Affine.rotate((-degrees * Math.PI) / 180)
  const lin = Affine.mul(rot, flip)
  // Solve translation so that lin * center_local + t = center.
  const mapped = Affine.apply(lin, center_local)
  const t = Point.sub(center, mapped)
  const c = lin.coeffs
  return Affine.new([c[0], c[1], c[2], c[3], t.x, t.y])
}

/** Rotate `xf` by `degrees` (Figma convention) about the point `pivot` (parent space). */
export function rotate_about(xf: Affine, pivot: Point, degrees: number): Affine {
  const pv: Vec2 = { x: pivot.x, y: pivot.y }
  return Affine.mul(
    Affine.mul(
      Affine.mul(
        Affine.translate(pv),
        Affine.rotate((-degrees * Math.PI) / 180)
      ),
      Affine.translate({ x: -pv.x, y: -pv.y })
    ),
    xf
  )
}

/** Round a value to `digits` decimals for display (avoids `-0` and float noise). */
export function round_to(v: number, digits: number): number {
  const f = Math.pow(10, digits)
  const r = Math.round(v * f) / f
  return r === 0 ? 0 : r
}
