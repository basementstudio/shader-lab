import { buildBlendNode as runtimeBlend } from "@runtime/renderer/blend-modes"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { PassNode as RuntimePass } from "@runtime/renderer/pass-node"
import { float, texture, vec4 } from "three/tsl"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import { buildBlendNode as editorBlend } from "@/renderer/blend-modes"
import { PassNode as EditorPass } from "@/renderer/pass-node"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import { BLEND_MODES, DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assertPixel(actual, expected, label, tolerance = 0.00001) {
  if (
    actual.some(
      (value, index) =>
        !Number.isFinite(value) || Math.abs(value - expected[index]) > tolerance
    )
  ) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

export async function checkAlphaCompositing() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const target = new THREE.RenderTarget(1, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const input = new THREE.DataTexture(
    new Float32Array([0, 0, 1, 0.5]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const read = async () =>
    Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1))
  const renderNode = async (node) => {
    material.colorNode = node
    material.needsUpdate = true
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    return read()
  }
  let samples = 0
  try {
    for (const [name, blend] of [
      ["editor", editorBlend],
      ["runtime", runtimeBlend],
    ]) {
      const cases = [
        {
          label: "half red over half blue",
          mode: "normal",
          opacity: 1,
          expected: [2 / 3, 0, 1 / 3, 0.75],
        },
        {
          label: "multiply blends only in overlap",
          mode: "multiply",
          opacity: 1,
          expected: [1 / 3, 0, 1 / 3, 0.75],
        },
        {
          label: "screen blends only in overlap",
          mode: "screen",
          opacity: 1,
          expected: [2 / 3, 0, 2 / 3, 0.75],
        },
        {
          label: "source opacity reduces coverage",
          mode: "normal",
          opacity: 0.5,
          expected: [0.4, 0, 0.6, 0.625],
        },
        {
          label: "zero opacity preserves backdrop",
          mode: "normal",
          opacity: 0,
          expected: [0, 0, 1, 0.5],
        },
        {
          label: "negative opacity is clamped",
          mode: "normal",
          opacity: -1,
          expected: [0, 0, 1, 0.5],
        },
        {
          label: "excess opacity is clamped",
          mode: "normal",
          opacity: 2,
          expected: [2 / 3, 0, 1 / 3, 0.75],
        },
      ]
      for (const test of cases) {
        assertPixel(
          await renderNode(
            blend(
              test.mode,
              vec4(0, 0, 1, 0.5),
              vec4(1, 0, 0, 0.5),
              float(test.opacity)
            )
          ),
          test.expected,
          `${name}: ${test.label}`
        )
        samples++
      }
      for (const mode of BLEND_MODES) {
        assertPixel(
          await renderNode(
            blend(
              mode,
              vec4(0.1, 0.9, 0.3, 0),
              vec4(0.8, 0.2, 0.4, 0.5),
              float(0.4)
            )
          ),
          [0.8, 0.2, 0.4, 0.2],
          `${name}/${mode}: hidden backdrop RGB cannot tint the source`
        )
        assertPixel(
          await renderNode(
            blend(
              mode,
              vec4(0.1, 0.9, 0.3, 0),
              vec4(0.8, 0.2, 0.4, 0),
              float(1)
            )
          ),
          [0, 0, 0, 0],
          `${name}/${mode}: empty output stays empty and finite`
        )
        samples += 2
      }
      assertPixel(
        await renderNode(
          blend("normal", vec4(0, 0, 0, 0), vec4(1, 0.5, 0.25, 1e-8), float(1))
        ),
        [1, 0.5, 0.25, 1e-8],
        `${name}: tiny coverage does not darken straight RGB`,
        1e-7
      )
      const first = blend(
        "normal",
        vec4(0, 0, 1, 0.5),
        vec4(1, 0, 0, 1),
        float(0.5),
        "filter",
        undefined,
        "effect"
      )
      assertPixel(
        await renderNode(first),
        [0.5, 0, 0.5, 0.5],
        `${name}: effects preserve input coverage`
      )
      assertPixel(
        await renderNode(
          blend(
            "normal",
            first,
            vec4(1, 0, 0, 1),
            float(0.5),
            "filter",
            undefined,
            "effect"
          )
        ),
        [0.75, 0, 0.25, 0.5],
        `${name}: repeated effects do not inflate coverage`
      )
      assertPixel(
        await renderNode(
          blend(
            "normal",
            vec4(0, 0, 1, 0.5),
            vec4(1, 0, 0, 0.5),
            float(1),
            "filter",
            undefined,
            "effect"
          )
        ),
        [0.5, 0, 0.5, 0.5],
        `${name}: effect alpha retains its strength semantics`
      )
      samples += 4

      // A transparent pixel and an opaque pixel must coexist in one target;
      // this cannot be achieved by lowering global material opacity.
      const stripe = new THREE.DataTexture(
        new Float32Array([0, 1, 0, 0, 0, 0, 1, 1]),
        2,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      )
      stripe.needsUpdate = true
      target.setSize(2, 1)
      try {
        await renderNode(
          blend("normal", texture(stripe), vec4(1, 0, 0, 0.5), float(1))
        )
        const sourcePixels = Array.from(
          await renderer.readRenderTargetPixelsAsync(target, 0, 0, 2, 1)
        )
        assertPixel(
          sourcePixels,
          [1, 0, 0, 0.5, 0.5, 0, 0.5, 1],
          `${name}: mixed source coverage in one target`
        )
        await renderNode(
          blend(
            "normal",
            texture(stripe),
            vec4(0, 1, 0, 1),
            float(0.5),
            "filter",
            undefined,
            "effect"
          )
        )
        const effectPixels = Array.from(
          await renderer.readRenderTargetPixelsAsync(target, 0, 0, 2, 1)
        )
        assertPixel(
          [effectPixels[3], effectPixels[7]],
          [0, 1],
          `${name}: effect retains both holes and opaque pixels`
        )
        samples += 2
      } finally {
        stripe.dispose()
        target.setSize(1, 1)
      }
    }

    for (const [name, Pass] of [
      ["editor", EditorPass],
      ["runtime", RuntimePass],
    ]) {
      // Exercise the real initial material and asynchronous replacement path,
      // not just the blend expression in a hand-configured test material.
      class SolidPass extends Pass {
        buildEffectNode() {
          return vec4(1, 0, 0, 0.5)
        }
        replaceEffect() {
          return this.swapEffectNodeAsync(vec4(0, 1, 0, 0.5))
        }
      }
      const pass = new SolidPass(`${name}-alpha`)
      try {
        pass.updateCompositionRole("source")
        pass.flushColorNode()
        pass.render(renderer, input, target, 0, 0)
        assertPixel(
          await read(),
          [2 / 3, 0, 1 / 3, 0.75],
          `${name}: pass material retains composed alpha`
        )
        if (!(await pass.replaceEffect()))
          throw new Error(`${name}: replacement material was not installed`)
        pass.render(renderer, input, target, 0, 0)
        assertPixel(
          await read(),
          [0, 2 / 3, 1 / 3, 0.75],
          `${name}: async material retains composed alpha`
        )
        pass.updateCompositionRole("effect")
        pass.flushColorNode()
        pass.render(renderer, input, target, 0, 0)
        assertPixel(
          await read(),
          [0, 0.5, 0.5, 0.5],
          `${name}: role changes rebuild composition`
        )
        samples += 3
      } finally {
        pass.dispose()
      }
    }

    const grade = new ScenePostProcess()
    try {
      grade.update({ ...DEFAULT_SCENE_CONFIG, brightness: 0.2 })
      grade.render(renderer, input, target)
      const graded = await read()
      if (graded[0] < 0.1 || graded[1] < 0.1)
        throw new Error("Scene grading did not run")
      assertPixel([graded[3]], [0.5], "Scene grading preserves alpha")
      samples++
    } finally {
      grade.dispose()
    }

    // Test the public headless path: it copies the external input and derives
    // source/effect roles from layer configuration before applying passes.
    const compilations = []
    const compileAsync = renderer.compileAsync.bind(renderer)
    renderer.compileAsync = (...args) => {
      const promise = compileAsync(...args)
      compilations.push(promise)
      return promise
    }
    const headless = createHeadlessRenderer({
      renderer,
      size: { width: 1, height: 1 },
    })
    try {
      await headless.initialize()
      for (const [type, expectedAlpha] of [
        [null, 0.5],
        ["posterize", 0.5],
        ["gradient", 0.75],
      ]) {
        const layers = type ? [{ ...createLayer(type), opacity: 0.5 }] : []
        const frame = runtimeFrame(
          { layers, timeline: { duration: 1, loop: true, tracks: [] } },
          0,
          0,
          1,
          { width: 1, height: 1 }
        )
        headless.render(frame, input)
        await Promise.all(compilations.splice(0))
        const output = headless.render(frame, input)
        if (!output) throw new Error("Headless pipeline produced no texture")
        const rgba = await renderNode(texture(output))
        assertPixel(
          [rgba[3]],
          [expectedAlpha],
          `Runtime texture pipeline: ${type ?? "input copy"}`
        )
        if (!type)
          assertPixel(
            rgba,
            [0, 0, 1, 0.5],
            "Runtime input copy preserves straight RGB"
          )
        samples++
      }
    } finally {
      headless.dispose()
      renderer.compileAsync = compileAsync
    }
    return samples
  } finally {
    input.dispose()
    target.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
  }
}
