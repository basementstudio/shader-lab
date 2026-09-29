import * as THREE from "three/webgpu"
import { type SVGResult, SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js"

export type SvgExtrusion = {
  bevel: number
  bevelSegments: number
  depth: number
}

type SvgStyle = {
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeOpacity?: number
  strokeWidth?: number
}

type SvgPiece =
  | { color: THREE.Color; kind: "fill"; shapes: THREE.Shape[] }
  | { color: THREE.Color; flat: THREE.BufferGeometry; kind: "stroke" }

const CURVE_SEGMENTS = 48
const CREASE_ANGLE = Math.PI / 6
const LAYER_GAP = 0.002

export function parseSvg(text: string): SVGResult {
  return new SVGLoader().parse(text)
}

function flipped(points: THREE.Vector2[]): THREE.Vector2[] {
  return points.map((point) => new THREE.Vector2(point.x, -point.y))
}

function flipShape(shape: THREE.Shape): THREE.Shape {
  const { holes, shape: outline } = shape.extractPoints(CURVE_SEGMENTS)
  const result = new THREE.Shape(flipped(outline))
  for (const hole of holes) {
    result.holes.push(new THREE.Path(flipped(hole)))
  }
  return result
}

function svgPieces(result: SVGResult): SvgPiece[] {
  const pieces: SvgPiece[] = []
  for (const path of result.paths) {
    const style = (path.userData?.style ?? {}) as SvgStyle
    if (style.fill !== undefined && style.fill !== "none" && (style.fillOpacity ?? 1) > 0) {
      const shapes = path.toShapes().map(flipShape)
      if (shapes.length > 0) {
        pieces.push({ color: path.color.clone(), kind: "fill", shapes })
      }
    }
    if (
      style.stroke !== undefined &&
      style.stroke !== "none" &&
      (style.strokeWidth ?? 1) > 0 &&
      (style.strokeOpacity ?? 1) > 0
    ) {
      const color = new THREE.Color().setStyle(style.stroke)
      for (const subPath of path.subPaths) {
        const flat = SVGLoader.pointsToStroke(
          subPath.getPoints(CURVE_SEGMENTS),
          path.userData?.style as Parameters<typeof SVGLoader.pointsToStroke>[1]
        )
        if (flat) {
          flat.scale(1, -1, 1)
          pieces.push({ color, flat, kind: "stroke" })
        }
      }
    }
  }
  return pieces
}

function piecesBox(pieces: readonly SvgPiece[]): THREE.Box2 {
  const box = new THREE.Box2()
  for (const piece of pieces) {
    if (piece.kind === "fill") {
      for (const shape of piece.shapes) {
        for (const point of shape.getPoints()) box.expandByPoint(point)
      }
    } else {
      const position = piece.flat.getAttribute("position")
      for (let index = 0; index < position.count; index += 1) {
        box.expandByPoint(new THREE.Vector2(position.getX(index), position.getY(index)))
      }
    }
  }
  return box
}

function extrudeFlat(flat: THREE.BufferGeometry, depth: number): THREE.BufferGeometry {
  const source = flat.index ? flat.toNonIndexed() : flat
  const position = source.getAttribute("position")
  const half = depth / 2
  const positions: number[] = []
  const normals: number[] = []
  const edges = new Map<string, { a: [number, number]; b: [number, number]; count: number }>()
  const key = (point: [number, number]) =>
    `${Math.round(point[0] * 1e4)},${Math.round(point[1] * 1e4)}`
  const push = (point: [number, number], z: number, normal: [number, number, number]) => {
    positions.push(point[0], point[1], z)
    normals.push(...normal)
  }
  for (let index = 0; index + 2 < position.count; index += 3) {
    const a: [number, number] = [position.getX(index), position.getY(index)]
    let b: [number, number] = [position.getX(index + 1), position.getY(index + 1)]
    let c: [number, number] = [position.getX(index + 2), position.getY(index + 2)]
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (Math.abs(area) < 1e-12) continue
    if (area < 0) [b, c] = [c, b]
    push(a, half, [0, 0, 1])
    push(b, half, [0, 0, 1])
    push(c, half, [0, 0, 1])
    push(a, -half, [0, 0, -1])
    push(c, -half, [0, 0, -1])
    push(b, -half, [0, 0, -1])
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const id = [key(from), key(to)].sort().join("|")
      const entry = edges.get(id)
      if (entry) entry.count += 1
      else edges.set(id, { a: from, b: to, count: 1 })
    }
  }
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy) || 1
    const normal: [number, number, number] = [dy / length, -dx / length, 0]
    push(a, half, normal)
    push(a, -half, normal)
    push(b, -half, normal)
    push(a, half, normal)
    push(b, -half, normal)
    push(b, half, normal)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
  if (source !== flat) source.dispose()
  return geometry
}

export function buildSvgModel(result: SVGResult, extrusion: SvgExtrusion): THREE.Group {
  const pieces = svgPieces(result)
  if (pieces.length === 0) {
    throw new Error("The SVG has no filled or stroked shapes. Convert text to outlines before importing.")
  }
  const box = piecesBox(pieces)
  const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 1e-6)
  const depth = Math.max(extrusion.depth, 0.001) * size
  const bevel = Math.min(Math.max(extrusion.bevel, 0), 0.5) * size
  const segments = Math.round(Math.min(Math.max(extrusion.bevelSegments, 1), 12))
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const materialFor = (color: THREE.Color) => {
    const id = color.getHexString()
    let material = materials.get(id)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.35 })
      materials.set(id, material)
    }
    return material
  }
  const group = new THREE.Group()
  group.name = "SVG"
  pieces.forEach((piece, index) => {
    const extruded =
      piece.kind === "fill"
        ? new THREE.ExtrudeGeometry(piece.shapes, {
            bevelEnabled: bevel > 0,
            bevelOffset: -bevel,
            bevelSegments: segments,
            bevelSize: bevel,
            bevelThickness: bevel,
            curveSegments: CURVE_SEGMENTS,
            depth,
          }).translate(0, 0, -depth / 2)
        : extrudeFlat(piece.flat, depth + bevel * 2)
    if (piece.kind === "stroke") piece.flat.dispose()
    const geometry = toCreasedNormals(extruded, CREASE_ANGLE)
    if (geometry !== extruded) extruded.dispose()
    geometry.translate(0, 0, index * LAYER_GAP * size)
    const mesh = new THREE.Mesh(geometry, materialFor(piece.color))
    mesh.name = `${piece.kind}-${index}`
    group.add(mesh)
  })
  return group
}
