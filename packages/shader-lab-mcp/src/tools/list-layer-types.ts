import type { ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "List layer types",
  },
  description:
    "List every layer type that can be added (sources generate imagery, effects transform the layers below them, model renders 3D). Use describe_layer_type for a type's parameters.",
  name: "list_layer_types",
}

export default function listLayerTypes() {
  return proxy("list_layer_types", {})
}
