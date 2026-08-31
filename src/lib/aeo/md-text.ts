/**
 * Escapes user-generated text for interpolation into markdown built for
 * crawlers: neutralizes link/heading/code/emphasis syntax and collapses
 * whitespace so published scene titles or descriptions can't inject structure
 * (fake links, headings, HTML) into the document.
 */
export function mdText(value: string): string {
  return value
    .replace(/[\\`*_[\]()<>#|]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim()
}
