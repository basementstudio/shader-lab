import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { normalizeHost } from "@/lib/editor/remote-asset"
import { readEnv } from "@/lib/read-env"

export const UPLOAD_URL_TTL_SECONDS = 60

let cached: S3Client | null = null

export function getR2Config() {
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID")
  const accountId = readEnv("CLOUDFLARE_ACCOUNT_ID")
  const bucket = readEnv("R2_BUCKET")
  const publicHost = normalizeHost(readEnv("NEXT_PUBLIC_R2_PUBLIC_HOST") ?? "")
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY")

  if (!(accessKeyId && accountId && bucket && publicHost && secretAccessKey)) {
    return null
  }

  return { accessKeyId, accountId, bucket, publicHost, secretAccessKey }
}

function getClient() {
  const config = getR2Config()

  if (!config) {
    throw new Error(
      "R2 is not configured. Guard callers with isMediaConfigured()."
    )
  }

  if (!cached) {
    cached = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  }

  return { client: cached, config }
}

export function publicUrlForKey(key: string): string {
  const config = getR2Config()

  if (!config) {
    return key
  }

  return `https://${config.publicHost}/${key.replace(/^\/+/, "")}`
}

export async function createUploadUrl(input: {
  contentLength: number
  contentType: string
  key: string
}): Promise<{ publicUrl: string; uploadUrl: string }> {
  const { client, config } = getClient()

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      ContentLength: input.contentLength,
      ContentType: input.contentType,
      Key: input.key,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-length", "content-type"]),
    }
  )

  return { publicUrl: publicUrlForKey(input.key), uploadUrl }
}

const SCENE_OBJECT_KEY = /^scenes\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/

export function keyFromPublicUrl(url: string): string | null {
  const config = getR2Config()

  if (!config) {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.hostname.toLowerCase() !== config.publicHost.toLowerCase()) {
    return null
  }

  const key = parsed.pathname.replace(/^\/+/, "")

  return SCENE_OBJECT_KEY.test(key) ? key : null
}

export function scenePrefixOf(key: string): string | null {
  const match = key.match(/^(scenes\/[A-Za-z0-9_-]+)\//)

  return match?.[1] ?? null
}

export async function deleteSceneObjects(
  keys: readonly string[]
): Promise<number> {
  const safe = [...new Set(keys)].filter((key) => SCENE_OBJECT_KEY.test(key))

  if (safe.length === 0) {
    return 0
  }

  const { client, config } = getClient()

  for (let index = 0; index < safe.length; index += 1000) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: {
          Objects: safe.slice(index, index + 1000).map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    )
  }

  return safe.length
}

export async function putObject(input: {
  body: Uint8Array | string
  contentType: string
  key: string
}): Promise<string> {
  const { client, config } = getClient()

  await client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: config.bucket,
      ContentType: input.contentType,
      Key: input.key,
    })
  )

  return publicUrlForKey(input.key)
}
