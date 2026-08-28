import { NextResponse } from "next/server"
import { APP_BASE_URL } from "@/lib/app"
import { EDITOR_PATH } from "@/lib/community/scene-links"
import { PRODUCT_FACTS } from "@/lib/structured-data/product-facts"

/**
 * MCP discovery card. Shader Lab's MCP server is a local stdio package (it
 * bridges to a running editor tab over loopback), not a hosted endpoint — so
 * this card is a pointer with install instructions, not a connectable URL.
 * Served with permissive CORS because agent clients fetch it cross-origin.
 */
export function GET() {
  const mcp = PRODUCT_FACTS.packages[1]

  return NextResponse.json(
    {
      name: "shader-lab",
      description: mcp.description,
      website: `${APP_BASE_URL}${EDITOR_PATH}`,
      transport: ["stdio"],
      install: {
        command: "npx",
        args: ["-y", mcp.name],
      },
      usage: `Register the stdio server with your MCP client, then open ${APP_BASE_URL}${EDITOR_PATH}?agent=1 in a WebGPU browser.`,
      authentication: { type: "none" },
      tools: [
        "get_project_state",
        "describe_layer_type",
        "add_layer",
        "update_layer_params",
        "write_custom_shader",
        "screenshot",
      ],
      documentation: [mcp.npmUrl, `${APP_BASE_URL}/llms.txt`],
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    }
  )
}
