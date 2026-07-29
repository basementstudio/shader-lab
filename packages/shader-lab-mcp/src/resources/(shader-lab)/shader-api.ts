import type { ResourceMetadata } from "xmcp"
import { getShaderApiReference } from "~/lib/shader-reference"

export const metadata: ResourceMetadata = {
  description:
    "Custom shader contract and the full list of globals available to TSL sketches",
  mimeType: "text/markdown",
  name: "shader-api-reference",
  title: "Shader Lab custom shader API",
}

export default function handler() {
  return getShaderApiReference()
}
