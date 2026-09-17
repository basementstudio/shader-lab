import * as THREE from "three/webgpu"
import {
  abs,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  int,
  length,
  Loop,
  max,
  min,
  mix,
  select,
  sin,
  smoothstep,
  step,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { CELL_PAINT_SIZE, decodeCellPaintMask } from "./cell-paint-mask"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
function number(
  value: unknown,
  fallback: number,
  low: number,
  high: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(low, Math.min(high, value))
    : fallback
}

/** Select photographic cells without replacing their interiors with flat samples. */
export class PhotographicCellsPass extends PassNode {
  private readonly painted = uniform(0)
  private readonly paintGuide = uniform(0)
  private readonly paintAspect = uniform(new THREE.Vector2(1, 1))
  private readonly paintTexture = new THREE.DataTexture(
    new Uint8Array(CELL_PAINT_SIZE ** 2),
    CELL_PAINT_SIZE,
    CELL_PAINT_SIZE,
    THREE.RedFormat
  )
  private readonly paintSource = texture(this.paintTexture)
  private paintValue = ""
  private readonly regions = uniform(0)
  private readonly regionSize = uniform(0.35)
  private readonly edgeScatter = uniform(0)
  private readonly outlineMode = uniform(2)
  private readonly size = uniform(0.1)
  private readonly cellAspect = uniform(1)
  private readonly irregularity = uniform(0.35)
  private readonly seed = uniform(1)
  private readonly selection = uniform(0)
  private readonly threshold = uniform(0.35)
  private readonly invert = uniform(0)
  private readonly gap = uniform(0.08)
  private readonly softness = uniform(0)
  private readonly outline = uniform(0)
  private readonly outlineColor = uniform(new THREE.Color("#e8e5dc"))
  private readonly cutout = uniform(1)
  private readonly aspect = uniform(new THREE.Vector2(1, 1))
  private readonly resolution = uniform(new THREE.Vector2(1, 1))
  private readonly source: Node
  private readonly placeholder: THREE.Texture

  constructor(id: string) {
    super(id)
    this.paintTexture.minFilter = THREE.NearestFilter
    this.paintTexture.magFilter = THREE.NearestFilter
    this.paintTexture.generateMipmaps = false
    this.paintTexture.needsUpdate = true
    this.placeholder = new THREE.Texture()
    this.placeholder.type = THREE.HalfFloatType
    this.placeholder.minFilter = THREE.NearestFilter
    this.placeholder.magFilter = THREE.NearestFilter
    this.placeholder.generateMipmaps = false
    this.source = texture(this.placeholder)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    input: THREE.Texture,
    output: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.source.value = input
    super.render(renderer, input, output, time, delta)
  }

  override resize(width: number, height: number): void {
    ;(this.resolution.value as THREE.Vector2).set(
      Math.max(1, width),
      Math.max(1, height)
    )
  }

  override updateLogicalSize(width: number, height: number): void {
    const shorter = Math.max(1, Math.min(width, height))
    ;(this.aspect.value as THREE.Vector2).set(
      Math.max(1, width) / shorter,
      Math.max(1, height) / shorter
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.painted.value = params.mode === "paint" ? 1 : 0
    this.paintGuide.value = params._paintGuide === true ? 0.18 : 0
    const paintValue =
      typeof params.paintMask === "string" ? params.paintMask : ""
    // Video/source changes do not decode or upload the painted mask again.
    if (paintValue !== this.paintValue) {
      const mask = decodeCellPaintMask(paintValue)
      this.paintTexture.image.data?.set(mask.data)
      this.paintTexture.needsUpdate = true
      ;(this.paintAspect.value as THREE.Vector2).set(mask.width, mask.height)
      this.paintValue = paintValue
    }
    this.regions.value = params.mode === "regions" ? 1 : 0
    this.regionSize.value = number(params.regionSize, 0.35, 0.05, 2)
    this.edgeScatter.value = number(params.edgeScatter, 0, 0, 1)
    this.outlineMode.value = 2
    if (params.outlineMode === "none") this.outlineMode.value = 0
    if (params.outlineMode === "perimeter") this.outlineMode.value = 1
    this.size.value = number(params.size, 0.1, 0.015, 0.5)
    this.cellAspect.value = number(params.cellAspect, 1, 0.25, 4)
    this.irregularity.value = number(params.irregularity, 0.35, 0, 1)
    this.seed.value = number(params.seed, 1, 0, 1000)
    this.selection.value = 0
    if (params.selection === "dark") this.selection.value = 1
    if (params.selection === "random") this.selection.value = 2
    this.threshold.value = number(params.threshold, 0.35, 0, 1)
    this.invert.value = params.invert === true ? 1 : 0
    this.gap.value = number(params.gap, 0.08, 0, 1)
    this.softness.value = number(params.softness, 0, 0, 0.025)
    this.outline.value = number(params.outline, 0, 0, 0.5)
    ;(this.outlineColor.value as THREE.Color).set(
      typeof params.outlineColor === "string" ? params.outlineColor : "#e8e5dc"
    )
    this.cutout.value = params.output === "keep-image" ? 0 : 1
  }

  protected override buildEffectNode(): Node {
    if (!this.source) return this.inputNode
    return Fn(() => {
      const hash = (value: Node) =>
        fract(
          sin(dot(value, vec2(127.1, 311.7)).add(this.seed.mul(74.7))).mul(
            43758.5453
          )
        )
      // Automatic and painted selection share the same geometry and outline.
      const sampleTone = (position: Node) => {
        const inset = vec2(0.5).div(this.resolution)
        const probe = this.source
          .sample(
            clamp(position.div(this.aspect).add(0.5), inset, vec2(1).sub(inset))
          )
          .level(0)
        return clamp(dot(probe.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 1)
      }
      const rowGeometry = (row: Node) => {
        const width = this.size
          .mul(this.cellAspect)
          .mul(mix(1, hash(vec2(row, 17)).mul(0.8).add(0.6), this.irregularity))
        const shift = hash(vec2(row, 53))
          .sub(0.5)
          .mul(width)
          .mul(this.irregularity)
        return { width, shift }
      }
      const cellAt = Fn(([id]: [Node]) => {
        const { width, shift } = rowGeometry(id.y)
        const center = vec2(
          id.x.add(0.5).mul(width).sub(shift),
          id.y.add(0.5).mul(this.size)
        )
        // Jitter only where selection is read, never the cell geometry or photo.
        // A bounded lookup (at most 1.5 cell widths/heights per axis) fragments
        // boundaries while leaving the interior intact. No extra source samples,
        // neighborhood search or time dependence; zero keeps the legacy path.
        const selectionPoint = center.toVar()
        If(
          this.edgeScatter
            .greaterThan(0)
            .and(
              this.regions.greaterThan(0.5).or(this.painted.greaterThan(0.5))
            ),
          () => {
            selectionPoint.addAssign(
              vec2(hash(id.add(vec2(71, 193))), hash(id.add(vec2(137, 47))))
                .sub(0.5)
                .mul(vec2(width, this.size))
                .mul(this.edgeScatter.mul(3))
            )
          }
        )
        const score = float(0).toVar()
        If(this.painted.greaterThan(0.5), () => {
          const paintUV = selectionPoint.div(this.paintAspect).add(0.5)
          const inside = paintUV.x
            .greaterThanEqual(0)
            .and(paintUV.x.lessThan(1))
            .and(paintUV.y.greaterThanEqual(0))
            .and(paintUV.y.lessThan(1))
          score.assign(
            select(
              inside,
              this.paintSource.sample(paintUV).level(0).r,
              float(0)
            )
          )
        }).Else(() => {
          If(this.regions.greaterThan(0.5), () => {
            // Smooth a field in composition space, then quantize only its boundary
            // into cells. Region Size never changes the photographic samples inside.
            const field = selectionPoint.div(this.regionSize)
            const base = floor(field)
            const fraction = fract(field)
            const blend = fraction
              .mul(fraction)
              .mul(float(3).sub(fraction.mul(2)))
            const values = vec4(0).toVar()
            If(this.selection.greaterThan(1.5), () => {
              values.assign(
                vec4(
                  hash(base),
                  hash(base.add(vec2(1, 0))),
                  hash(base.add(vec2(0, 1))),
                  hash(base.add(1))
                )
              )
            }).Else(() => {
              values.assign(
                vec4(
                  sampleTone(base.mul(this.regionSize)),
                  sampleTone(base.add(vec2(1, 0)).mul(this.regionSize)),
                  sampleTone(base.add(vec2(0, 1)).mul(this.regionSize)),
                  sampleTone(base.add(1).mul(this.regionSize))
                )
              )
              If(this.selection.greaterThan(0.5), () => {
                values.assign(float(1).sub(values))
              })
            })
            score.assign(
              mix(
                mix(values.x, values.y, blend.x),
                mix(values.z, values.w, blend.x),
                blend.y
              )
            )
          }).Else(() => {
            If(this.selection.greaterThan(1.5), () => {
              score.assign(hash(id))
            }).Else(() => {
              const luma = sampleTone(center)
              score.assign(
                select(
                  this.selection.greaterThan(0.5),
                  float(1).sub(luma),
                  luma
                )
              )
            })
          })
        })
        const automatic = select(
          this.threshold.lessThanEqual(0),
          float(1),
          select(
            this.threshold.greaterThanEqual(1),
            float(0),
            step(this.threshold, score)
          )
        )
        const chosen = select(
          this.painted.greaterThan(0.5),
          step(0.5, score),
          automatic
        )
        const selected = select(
          this.invert.greaterThan(0.5),
          float(1).sub(chosen),
          chosen
        )
        return vec4(center, width, selected)
      }).setLayout({
        name: "photographicCell",
        type: "vec4",
        inputs: [{ name: "id", type: "vec2" }],
      })
      const screen = vec2(uv().x, float(1).sub(uv().y))
      const point = screen.sub(0.5).mul(this.aspect)
      const row = floor(point.y.div(this.size))
      const geometry = rowGeometry(row)
      const column = floor(point.x.add(geometry.shift).div(geometry.width))
      const current = cellAt(vec2(column, row)).toVar()
      const center = current.xy
      const width = current.z
      const selected = current.w
      const cell = vec2(width, this.size)
      const local = abs(point.sub(center))
      const half = cell.mul(float(1).sub(this.gap)).mul(0.5)
      const distance = max(local.x.sub(half.x), local.y.sub(half.y))
      const pixel = max(
        this.aspect.x.div(this.resolution.x),
        this.aspect.y.div(this.resolution.y)
      )
      const edge = max(pixel.mul(0.75), this.softness)
      const coverage = select(
        this.gap.equal(0),
        float(1),
        float(1).sub(smoothstep(edge.negate(), edge, distance))
      ).mul(select(this.gap.greaterThanEqual(1), float(0), float(1)))
      const mask = coverage.mul(selected)
      const strokeWidth = min(width, this.size).mul(this.outline)
      const outlineDistance = distance.toVar()
      If(
        this.outlineMode
          .equal(1)
          .and(this.gap.equal(0))
          .and(this.outline.greaterThan(0)),
        () => {
          // Distance to the complement of the selected union, rather than to each
          // cell edge. Search neighboring rows by their own widths/staggers so
          // T-junctions and narrow cells do not leave internal seams.
          const boundary = min(
            this.aspect.x.mul(0.5).sub(abs(point.x)),
            this.aspect.y.mul(0.5).sub(abs(point.y))
          ).toVar()
          // Only pixels close enough to a cell edge can carry a perimeter.
          // Bound neighbor queries by the stroke reach before sampling the source.
          const reach = strokeWidth.add(edge)
          If(
            selected
              .greaterThan(0.5)
              .and(distance.greaterThanEqual(reach.negate())),
            () => {
              const rows = floor(reach.div(this.size)).add(1)
              Loop(
                { start: 0, end: int(rows.mul(2).add(1)), type: "int" },
                ({ i }) => {
                  const neighborRow = row.add(float(i).sub(rows))
                  const adjacent = rowGeometry(neighborRow)
                  const nearestColumn = floor(
                    point.x.add(adjacent.shift).div(adjacent.width)
                  )
                  const columns = floor(reach.div(adjacent.width)).add(1)
                  Loop(
                    {
                      start: 0,
                      end: int(columns.mul(2).add(1)),
                      type: "int",
                      name: "j",
                    },
                    ({ j }) => {
                      const neighborColumn = nearestColumn.add(
                        float(j).sub(columns)
                      )
                      const neighborCenter = vec2(
                        neighborColumn
                          .add(0.5)
                          .mul(adjacent.width)
                          .sub(adjacent.shift),
                        neighborRow.add(0.5).mul(this.size)
                      )
                      const outside = length(
                        max(
                          abs(point.sub(neighborCenter)).sub(
                            vec2(adjacent.width, this.size).mul(0.5)
                          ),
                          vec2(0)
                        )
                      )
                      If(
                        outside.lessThan(boundary).and(outside.lessThan(reach)),
                        () => {
                          const neighbor = cellAt(
                            vec2(neighborColumn, neighborRow)
                          )
                          If(neighbor.w.lessThan(0.5), () => {
                            boundary.assign(outside)
                          })
                        }
                      )
                    }
                  )
                }
              )
            }
          )
          outlineDistance.assign(boundary.negate())
        }
      )
      const interior = float(1).sub(
        smoothstep(edge.negate(), edge, outlineDistance.add(strokeWidth))
      )
      // Subtract the inset fill from the outer coverage. Multiplying two edge
      // fades adds extra ink when a gap opens, especially for thin outlines.
      const strokeCoverage = max(coverage.sub(interior), 0).mul(
        select(
          this.outline.greaterThan(0).and(this.outlineMode.greaterThan(0)),
          float(1),
          float(0)
        )
      )
      // RGB is straight-alpha: normalize here because mask applies coverage below.
      const stroke = strokeCoverage.div(max(coverage, 0.000001))
      const original = this.inputNode
      const rgb = mix(original.rgb, this.outlineColor, stroke)
      // Outlines never manufacture coverage in transparent parts of the source.
      return select(
        this.cutout.greaterThan(0.5),
        vec4(rgb, original.a.mul(max(mask, this.paintGuide.mul(this.painted)))),
        vec4(mix(original.rgb, rgb, mask), original.a)
      )
    })()
  }

  override dispose(): void {
    this.paintTexture.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
