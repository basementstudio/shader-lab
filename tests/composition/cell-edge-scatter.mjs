import {
  emptyCellPaintMask,
  encodeCellPaintMask,
} from "@/renderer/cell-paint-mask"

// Run against both pass implementations, using the suite's exact pixel parity.
export async function checkCellEdgeScatter({
  paint,
  at,
  close,
  assert,
  color,
  solid,
  photo,
  pass,
}) {
  const mask = emptyCellPaintMask(2, 2)
  for (let y = 0; y < 512; y++) mask.data.fill(255, y * 512, y * 512 + 256)
  const params = {
    mode: "paint",
    paintMask: encodeCellPaintMask(mask),
    size: 0.0625,
    cellAspect: 1,
    irregularity: 0,
    gap: 0,
    outline: 0,
    seed: 17,
  }
  const original = await paint("scatter original half-plane", params)
  const scattered = await paint("scatter half-plane", {
    ...params,
    edgeScatter: 1,
  })
  const graph = pass.material.colorNode
  let changed = 0
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const pixel = at(scattered, x, y)
      // At most 1.5 cells of lookup displacement per axis. A coherent interior
      // and its distant complement must survive even maximum scatter.
      if (x < 26) close(pixel, color, "Scatter eroded the main region")
      if (x >= 38) close(pixel, [0, 0, 0, 0], "Scatter escaped the edge band")
      if (pixel[3] !== at(original, x, y)[3]) changed++
      // Geometry stays on the same four-pixel grid; jitter is selection-only.
      close(
        pixel,
        at(scattered, Math.floor(x / 4) * 4, Math.floor(y / 4) * 4),
        "Scatter displaced cell geometry"
      )
    }
  assert(changed > 16, "Scatter did not fragment the boundary")
  close(
    await paint("scatter explicit zero", { ...params, edgeScatter: 0 }),
    original,
    "Zero failed to restore original edge",
    0
  )
  close(
    await paint("scatter missing reset", params),
    original,
    "Missing scatter retained old value",
    0
  )
  close(
    await paint("scatter repeat", { ...params, edgeScatter: 1 }),
    scattered,
    "Scatter is not deterministic",
    0
  )
  const reseeded = await paint("scatter seed", {
    ...params,
    edgeScatter: 1,
    seed: 18,
  })
  assert(
    reseeded.some((v, i) => v !== scattered[i]),
    "Seed did not change scatter"
  )
  const inverse = await paint("scatter inverse", {
    ...params,
    edgeScatter: 1,
    invert: true,
  })
  for (let i = 3; i < inverse.length; i += 4)
    close(
      [inverse[i] + scattered[i]],
      [color[3]],
      "Inverted scatter isn't complementary"
    )
  const detail = await paint(
    "scatter source detail",
    { ...params, edgeScatter: 1 },
    photo
  )
  const full = await paint(
    "scatter source identity",
    { threshold: 0, gap: 0, outline: 0 },
    photo
  )
  for (let i = 0; i < detail.length; i += 4)
    close(
      detail.slice(i, i + 4),
      scattered[i + 3] > 0 ? full.slice(i, i + 4) : [0, 0, 0, 0],
      "Scatter moved photo or manufactured alpha"
    )
  const outlined = await paint("scatter perimeter", {
    ...params,
    edgeScatter: 1,
    outlineMode: "perimeter",
    outline: 0.2,
    outlineColor: "#00ff00",
  })
  for (let i = 3; i < outlined.length; i += 4)
    close([outlined[i]], [scattered[i]], "Outline changed scattered coverage")
  assert(
    outlined.some((v, i) => i % 4 === 1 && v > color[1] + 0.1),
    "Scattered perimeter missing"
  )
  const keep = await paint("scatter keep image", {
    ...params,
    edgeScatter: 1,
    output: "keep-image",
    outlineMode: "perimeter",
    outline: 0.2,
  })
  for (let i = 3; i < keep.length; i += 4)
    close([keep[i]], [color[3]], "Keep Image lost coverage")
  const cells = {
    ...params,
    mode: "cells",
    selection: "random",
    threshold: 0.5,
  }
  close(
    await paint("scatter ignored individual", { ...cells, edgeScatter: 1 }),
    await paint("scatter individual zero", cells),
    "Individual cells changed",
    0
  )
  const regions = {
    ...params,
    mode: "regions",
    selection: "random",
    regionSize: 0.4,
    threshold: 0.5,
  }
  const coherent = await paint("scatter regions zero", regions)
  const fragmented = await paint("scatter regions", {
    ...regions,
    edgeScatter: 0.8,
  })
  assert(
    fragmented.some((v, i) => v !== coherent[i]),
    "Automatic regions not scattered"
  )
  for (const selection of ["light", "dark"])
    await paint(
      `scatter tone ${selection}`,
      {
        ...regions,
        selection,
        edgeScatter: 0.8,
        irregularity: 0.8,
        cellAspect: 0.4,
        gap: 0.1,
        outline: 0.2,
        outlineMode: "perimeter",
      },
      photo
    )
  // Different source frame: static seeded geometry must stay fixed. Reuse the
  // same paint upload and shader graph; RGB is still sampled live each frame.
  await paint("scatter live baseline", { ...params, edgeScatter: 1 }, solid)
  const uploaded = pass.paintTexture.version
  const oldColor = Array.from(solid.image.data)
  try {
    solid.image.data.set([0.1, 0.8, 0.2, 0.6])
    solid.needsUpdate = true
    const next = await paint(
      "scatter live next frame",
      { ...params, edgeScatter: 1 },
      solid
    )
    for (let i = 0; i < next.length; i += 4)
      close(
        next.slice(i, i + 4),
        scattered[i + 3] > 0 ? [0.1, 0.8, 0.2, 0.6] : [0, 0, 0, 0],
        "Source change moved or froze scatter"
      )
    assert(
      pass.paintTexture.version === uploaded,
      "Source change uploaded paint"
    )
    assert(pass.material.colorNode === graph, "Scatter rebuilt shader graph")
  } finally {
    solid.image.data.set(oldColor)
    solid.needsUpdate = true
  }
}
