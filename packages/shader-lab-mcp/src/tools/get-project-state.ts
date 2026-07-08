import type { ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Get project state",
  },
  description:
    "Get the current editor state: composition size, the layer stack, and the selected layer. Layers stack like Photoshop: index 0 is the top of the sidebar (applied last), the highest index is the base/background. Layer params are omitted here; use get_layer for full params.",
  name: "get_project_state",
}

export default function getProjectState() {
  return proxy("get_project_state", {})
}
