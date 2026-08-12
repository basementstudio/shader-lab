import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { normalizeHost } from "@/lib/editor/remote-asset"

export const UPLOAD_URL_TTL_SECONDS = 60

let cached: S3Client | null = null

export function getR2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  const publicHost = normalizeHost(process.env.NEXT_PUBLIC_R2_PUBLIC_HOST ?? "")
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()

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
