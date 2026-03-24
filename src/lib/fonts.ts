import localFont from "next/font/local"

const mono = localFont({
  src: [
    {
      path: "../../public/fonts/geist/Geist-Mono.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--geist-mono",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Consolas",
    "Liberation Mono",
    "Menlo",
    "monospace",
  ],
})

const fonts = [mono]
const fontsVariable = fonts.map((font) => font.variable).join(" ")

export { fontsVariable }
