import localFont from "next/font/local"

const sans = localFont({
  src: [
    {
      path: "../../public/fonts/geist/Geist-Sans-VF.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--geist-sans",
})

const mono = localFont({
  src: [
    {
      path: "../../public/fonts/geist/Geist-Mono.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Consolas",
    "Liberation Mono",
    "Menlo",
    "monospace",
  ],
  preload: true,
  variable: "--geist-mono",
})

const adhesion = localFont({
  src: [
    {
      path: "../../public/fonts/adhesion/Adhesion-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--adhesion",
})

const blob = localFont({
  src: [
    {
      path: "../../public/fonts/blob/Blob-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--blob",
})

const bsmntGrotesque = localFont({
  src: [
    {
      path: "../../public/fonts/bsmnt-grotesque/BasementGrotesqueVF.woff2",
      style: "normal",
      weight: "400 900",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--bsmnt-grotesque",
})

const bunker = localFont({
  src: [
    {
      path: "../../public/fonts/bunker/Bunker-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--bunker",
})

const caniche = localFont({
  src: [
    {
      path: "../../public/fonts/caniche/Caniche-VF.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--caniche",
})

const carpenter = localFont({
  src: [
    {
      path: "../../public/fonts/carpenter/Carpenter-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Times New Roman",
  display: "swap",
  fallback: ["Georgia", "serif"],
  preload: true,
  variable: "--carpenter",
})

const curia = localFont({
  src: [
    {
      path: "../../public/fonts/curia/Curia-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Times New Roman",
  display: "swap",
  fallback: ["Georgia", "serif"],
  preload: true,
  variable: "--curia",
})

const ffflauta = localFont({
  src: [
    {
      path: "../../public/fonts/ffflauta/FFFlauta-100.woff2",
      style: "normal",
      weight: "100",
    },
    {
      path: "../../public/fonts/ffflauta/FFFlauta-200.woff2",
      style: "normal",
      weight: "200",
    },
    {
      path: "../../public/fonts/ffflauta/FFFlauta-300.woff2",
      style: "normal",
      weight: "300",
    },
    {
      path: "../../public/fonts/ffflauta/FFFlauta-400.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--ffflauta",
})

const numero = localFont({
  src: [
    {
      path: "../../public/fonts/numero/Numero-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--numero",
})

const xer0 = localFont({
  src: [
    {
      path: "../../public/fonts/xer0/Xer0-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--xer0",
})

const trovador = localFont({
  src: [
    {
      path: "../../public/fonts/trovador/Trovador-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Times New Roman",
  display: "swap",
  fallback: ["Georgia", "serif"],
  preload: true,
  variable: "--trovador",
})

const bMecha = localFont({
  src: [
    {
      path: "../../public/fonts/b-mecha/B-Mecha-Regular.woff2",
      style: "normal",
      weight: "400",
    },
  ],
  adjustFontFallback: "Arial",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  variable: "--b-mecha",
})

const fonts = [
  sans,
  mono,
  adhesion,
  blob,
  bsmntGrotesque,
  bunker,
  caniche,
  carpenter,
  curia,
  ffflauta,
  numero,
  xer0,
  trovador,
  bMecha,
]
const fontsVariable = fonts.map((font) => font.variable).join(" ")

export { fontsVariable }
