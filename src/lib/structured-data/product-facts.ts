import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { EFFECT_LAYER_TYPES } from "@/types/editor"

/**
 * Canonical machine-readable facts about Shader Lab — the single source of
 * truth for entity copy consumed by JSON-LD structured data, the about page,
 * `/llms.txt`, `/agents.md`, and the markdown mirrors.
 *
 * Hardcoded on purpose: this copy is load-bearing for LLM / answer-engine
 * discoverability and must never render empty. Phrasing avoids counts that go
 * stale ("a catalog of stackable effects" over "30 effects"). Effect names are
 * derived from `LAYER_CATALOG` so they can't drift from the editor.
 */
export const PRODUCT_FACTS = {
  name: "Shader Lab",
  description:
    "Shader Lab is a free browser-based editor by basement.studio for creating, stacking, and animating shader effects on images, video, text, and 3D models. It runs on WebGPU, supports custom TSL shaders compiled in the browser, exports video, and has a community gallery where every published scene can be opened and remixed. Scenes can also be embedded in any React site with the open-source runtime, and AI agents can drive the editor through an MCP server.",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web browser",
  browserRequirements: "Requires WebGPU",
  // Published on the privacy page as the contact for account/data requests.
  contactEmail: "dev@basement.studio",
  githubUrl: "https://github.com/basementstudio/shader-lab",
  capabilities: [
    "Layer-based shader composition",
    "Timeline parameter animation",
    "Custom TSL shaders compiled in the browser",
    "Image, video, camera, text, and 3D model sources",
    "Video and image export",
    "Community gallery with remixing and lineage credit",
    "React runtime for embedding scenes",
    "MCP server so AI agents can drive the editor",
  ],
  packages: [
    {
      name: "@basementstudio/shader-lab",
      description:
        "Portable React/WebGPU runtime — render exported Shader Lab scenes in any React app.",
      npmUrl: "https://www.npmjs.com/package/@basementstudio/shader-lab",
    },
    {
      name: "@basementstudio/shader-lab-mcp",
      description:
        "MCP server that lets an AI agent drive a running Shader Lab editor tab — create and tweak layers, write custom TSL shaders, and screenshot the canvas.",
      npmUrl: "https://www.npmjs.com/package/@basementstudio/shader-lab-mcp",
    },
  ],
  publisher: {
    name: "basement.studio",
    alternateNames: [
      "Basement Studio",
      "basement studio",
      "basement",
      "BSMNT",
      "basementstudio",
    ],
    foundingDate: "2020",
    url: "https://basement.studio",
    sameAs: [
      "https://x.com/basementstudio",
      "https://www.instagram.com/basementdotstudio",
      "https://github.com/basementstudio",
    ],
  },
} as const

/** Effect names as shown in the editor, alphabetical — e.g. "ASCII", "CRT". */
export function getEffectNames(): string[] {
  return EFFECT_LAYER_TYPES.map(getLayerLabel).sort((left, right) =>
    left.localeCompare(right)
  )
}
