import * as THREE from "three/webgpu"
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"

const MAX_BADGE_PATHS = 1

export interface SvgBadgeMeshResult {
  fileName: string
  geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes>
}

function getShapesFaceSize(shapes: THREE.Shape[]): number {
  const bounds = new THREE.Box2(
    new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new THREE.Vector2(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  )

  for (const shape of shapes) {
    const points = shape.getPoints(48)

    for (const point of points) {
      bounds.expandByPoint(point)
    }
  }

  const size = new THREE.Vector2()
  bounds.getSize(size)
  return Math.max(size.x, size.y, 1e-6)
}

function normalizeSvgFileName(fileName: string): string {
  const trimmed = fileName.trim()

  return trimmed || "badge.svg"
}

function hasVisibleFill(path: any): boolean {
  const style = path.userData?.style
  const fill = style?.fill

  return Boolean(fill && fill !== "none")
}

export function validateSvgBadgeSource(svgSource: string): void {
  const trimmed = svgSource.trim()

  if (!trimmed) {
    throw new Error("Upload an SVG to render the badge.")
  }

  const pathMatches = trimmed.match(/<path\b/gi) ?? []

  if (pathMatches.length === 0) {
    throw new Error("SVG badge requires a filled shape.")
  }

  if (pathMatches.length > MAX_BADGE_PATHS) {
    throw new Error("SVG badge v1 supports a single filled shape.")
  }
}

export function buildSvgBadgeGeometry(
  svgSource: string,
  fileName: string,
  thickness: number
): SvgBadgeMeshResult {
  validateSvgBadgeSource(svgSource)

  const loader = new SVGLoader()
  const parsed = loader.parse(svgSource)
  const filledPaths = parsed.paths.filter(hasVisibleFill)

  if (filledPaths.length === 0) {
    throw new Error("SVG badge requires a filled shape.")
  }

  if (filledPaths.length > MAX_BADGE_PATHS) {
    throw new Error("SVG badge v1 supports a single filled shape.")
  }

  const [primaryPath] = filledPaths

  if (!primaryPath) {
    throw new Error("Could not read the SVG shape.")
  }

  const shapes = SVGLoader.createShapes(primaryPath)

  if (shapes.length === 0) {
    throw new Error("Could not convert the SVG into badge geometry.")
  }

  const faceSize = getShapesFaceSize(shapes)
  const normalizedThickness = Math.max(0.04, thickness)
  const depth = faceSize * normalizedThickness
  const bevelThickness = Math.min(depth * 0.38, faceSize * 0.022)
  const bevelSize = Math.min(faceSize * 0.02, bevelThickness * 1.1)
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    bevelEnabled: true,
    bevelOffset: 0,
    bevelSegments: 6,
    bevelSize,
    bevelThickness,
    curveSegments: 48,
    depth,
    steps: 2,
  })

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox

  if (!bounds) {
    throw new Error("Could not calculate the SVG badge bounds.")
  }

  const size = new THREE.Vector3()
  bounds.getSize(size)
  const normalizedFaceSize = Math.max(size.x, size.y, 1e-6)
  const center = new THREE.Vector3()
  bounds.getCenter(center)

  geometry.translate(-center.x, -center.y, -center.z)
  geometry.rotateX(Math.PI)
  geometry.scale(
    1 / normalizedFaceSize,
    1 / normalizedFaceSize,
    1 / normalizedFaceSize
  )
  geometry.computeVertexNormals()

  return {
    fileName: normalizeSvgFileName(fileName),
    geometry,
  }
}
