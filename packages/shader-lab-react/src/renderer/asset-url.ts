export function resolvePackageAssetUrl(relativePath: string): string {
  return new URL(`../../../assets/${relativePath}`, import.meta.url).toString()
}
