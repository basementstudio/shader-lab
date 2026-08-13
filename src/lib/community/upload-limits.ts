export const MAX_ASSET_BYTES = 100 * 1024 * 1024
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

export function maxBytesForMimeType(mimeType: string): number {
  return isImageMimeType(mimeType) ? MAX_IMAGE_BYTES : MAX_ASSET_BYTES
}

export function formatBytes(bytes: number): string {
  if (!(Number.isFinite(bytes) && bytes > 0)) {
    return "0 MB"
  }

  const megabytes = bytes / (1024 * 1024)

  return megabytes < 10
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.round(megabytes)} MB`
}

export function describeUploadLimit(input: {
  fileName?: string | null
  mimeType: string
  sizeBytes: number
}): string | null {
  const limit = maxBytesForMimeType(input.mimeType)

  if (input.sizeBytes > 0 && input.sizeBytes <= limit) {
    return null
  }

  const subject = input.fileName ? `"${input.fileName}"` : "One of the files"

  if (!(input.sizeBytes > 0)) {
    return `${subject} is empty.`
  }

  const noun = isImageMimeType(input.mimeType) ? "Images" : "Files"

  return `${noun} must be ${formatBytes(limit)} or smaller, and ${subject} is ${formatBytes(input.sizeBytes)}.`
}
