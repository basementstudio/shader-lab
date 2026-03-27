import { rm } from "node:fs/promises"

await rm(new URL("../dist", import.meta.url), { force: true, recursive: true })
await rm(new URL("../tsconfig.build.tsbuildinfo", import.meta.url), { force: true })
