import { Euler, type PerspectiveCamera, Quaternion, Vector3 } from "three"
import type { LayerParameterValues } from "@/types/editor"

export type Vec3 = [number, number, number]

export type ModelFraming = {
  elevation: number
  focalLength: number
  location: Vec3
  orbit: number
  rotation: Vec3
  scale: Vec3
  shift: [number, number]
  spin: number
}

export const MODEL_FRAME_FILL = 0.9
const SHORT_SENSOR_MM = 24
const DEG = Math.PI / 180

function finite(value: unknown, fallback: number, low = -1e6, high = 1e6): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

function vector<T extends number[]>(value: unknown, fallback: T): T {
  return Array.isArray(value) &&
    value.length === fallback.length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? ([...value] as T)
    : ([...fallback] as T)
}

export function readModelFraming(params: LayerParameterValues): ModelFraming {
  const scale = vector<Vec3>(params.scale, [1, 1, 1]).map((entry) =>
    Math.min(50, Math.max(0.01, Math.abs(entry)))
  ) as Vec3
  return {
    elevation: finite(params.elevation, 15, -89, 89),
    focalLength: finite(params.focalLength, 50, 8, 400),
    location: vector<Vec3>(params.location, [0, 0, 0]),
    orbit: finite(params.orbit, 30, -360, 360),
    rotation: vector<Vec3>(params.rotation, [0, 0, 0]),
    scale,
    shift: vector<[number, number]>(params.shift, [0, 0]),
    spin: finite(params.spin, 0, -720, 720),
  }
}

export function modelRadius(framing: ModelFraming): number {
  return Math.max(...framing.scale)
}

export function shortFieldOfView(focalLength: number): number {
  return 2 * Math.atan(SHORT_SENSOR_MM / 2 / Math.max(1, focalLength))
}

export function modelCameraDistance(focalLength: number): number {
  return 1 / Math.sin((shortFieldOfView(focalLength) / 2) * MODEL_FRAME_FILL)
}

export function configureModelCamera(
  camera: PerspectiveCamera,
  framing: ModelFraming,
  width: number,
  height: number
): number {
  const aspect = Math.max(1, width) / Math.max(1, height)
  const shortFov = shortFieldOfView(framing.focalLength)
  const verticalFov =
    aspect >= 1 ? shortFov : 2 * Math.atan(Math.tan(shortFov / 2) / aspect)
  const distance = modelCameraDistance(framing.focalLength)
  const orbit = framing.orbit * DEG
  const elevation = framing.elevation * DEG
  camera.fov = verticalFov / DEG
  camera.position.set(
    distance * Math.cos(elevation) * Math.sin(orbit),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(orbit)
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)
  const reach = Math.hypot(...framing.location) + modelRadius(framing)
  camera.near = Math.max(0.005, distance - reach * 2)
  camera.far = distance + reach * 4 + 60
  const shorter = Math.min(width, height)
  camera.setViewOffset(
    Math.max(1, width),
    Math.max(1, height),
    -framing.shift[0] * shorter,
    framing.shift[1] * shorter,
    Math.max(1, width),
    Math.max(1, height)
  )
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return distance
}

export function modelCameraBasis(
  orbitDegrees: number,
  elevationDegrees: number
): { forward: Vector3; right: Vector3; up: Vector3 } {
  const orbit = orbitDegrees * DEG
  const elevation = elevationDegrees * DEG
  const toCamera = new Vector3(
    Math.cos(elevation) * Math.sin(orbit),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(orbit)
  )
  const right = new Vector3(0, 1, 0).cross(toCamera).normalize()
  const up = toCamera.clone().cross(right).normalize()
  return { forward: toCamera.clone().negate(), right, up }
}

export function eulerToQuaternion(rotation: readonly number[]): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(
      (rotation[0] ?? 0) * DEG,
      (rotation[1] ?? 0) * DEG,
      (rotation[2] ?? 0) * DEG,
      "XYZ"
    )
  )
}

export function quaternionToEuler(quaternion: Quaternion): Vec3 {
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ")
  const round = (radians: number) => Math.round((radians / DEG) * 10) / 10
  return [round(euler.x), round(euler.y), round(euler.z)]
}

export function rotateAboutAxis(
  rotation: readonly number[],
  axis: Vector3,
  radians: number
): Vec3 {
  return quaternionToEuler(
    new Quaternion()
      .setFromAxisAngle(axis.clone().normalize(), radians)
      .multiply(eulerToQuaternion(rotation))
  )
}

export function trackballRotation(
  rotation: readonly number[],
  dx: number,
  dy: number,
  span: number,
  basis: { right: Vector3; up: Vector3 }
): Vec3 {
  const size = Math.max(1e-6, span)
  const turn = new Quaternion().setFromAxisAngle(basis.up, (dx / size) * Math.PI)
  const tilt = new Quaternion().setFromAxisAngle(
    basis.right,
    (dy / size) * Math.PI
  )
  return quaternionToEuler(
    turn.multiply(tilt).multiply(eulerToQuaternion(rotation))
  )
}
