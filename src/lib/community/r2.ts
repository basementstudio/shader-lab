import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
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

const SCENE_KEY_PREFIX = /^scenes\/[A-Za-z0-9_-]+\/$/

export async function deleteScenePrefix(prefix: string): Promise<number> {
  if (!SCENE_KEY_PREFIX.test(prefix)) {
    throw new Error(
      `Refusing to delete by prefix "${prefix}". Expected scenes/<sceneId>/.`
    )
  }

  const { client, config } = getClient()
  let continuationToken: string | undefined
  let deleted = 0

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
      })
    )

    const keys = (listed.Contents ?? [])
      .map((entry) => entry.Key)
      .filter((key): key is string => Boolean(key))

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      )

      deleted += keys.length
    }

    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined
  } while (continuationToken)

  return deleted
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
