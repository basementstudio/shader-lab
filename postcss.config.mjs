const presetEnvConfig = {
  autoprefixer: {
    flexbox: "no-2009",
  },
  stage: 3,
  features: {
    "nesting-rules": true,
  },
}

const postcssConfig = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-env": presetEnvConfig,
  },
}

export default postcssConfig
