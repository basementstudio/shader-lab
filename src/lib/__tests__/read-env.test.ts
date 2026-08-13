import { afterEach, describe, expect, test } from "bun:test"
import { readEnv, readEnvList, unwrapEnvValue } from "@/lib/read-env"

const KEY = "READ_ENV_TEST_VALUE"
const saved = new Map<string, string | undefined>()

function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) {
    saved.set(key, process.env[key])
  }

  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  saved.clear()
})

describe("unwrapEnvValue", () => {
  test("strips one matching pair of double quotes", () => {
    expect(unwrapEnvValue('"hello"')).toBe("hello")
  })

  test("strips one matching pair of single quotes", () => {
    expect(unwrapEnvValue("'hello'")).toBe("hello")
  })

  test("trims inside and outside the quotes", () => {
    expect(unwrapEnvValue('  "  hello  "  ')).toBe("hello")
  })

  test("leaves a lone leading quote alone rather than corrupting it", () => {
    expect(unwrapEnvValue('"hello')).toBe('"hello')
    expect(unwrapEnvValue('hello"')).toBe('hello"')
  })

  test("leaves interior quotes intact", () => {
    expect(unwrapEnvValue('say "hi"')).toBe('say "hi"')
  })

  test("only strips one layer", () => {
    expect(unwrapEnvValue('""hello""')).toBe('"hello"')
  })
})

describe("readEnv", () => {
  test("returns null for unset, empty and whitespace-only values", () => {
    setEnv(KEY, undefined)
    expect(readEnv(KEY)).toBeNull()

    setEnv(KEY, "")
    expect(readEnv(KEY)).toBeNull()

    setEnv(KEY, "   ")
    expect(readEnv(KEY)).toBeNull()
  })

  test("a value of nothing but quotes counts as unset", () => {
    setEnv(KEY, '""')
    expect(readEnv(KEY)).toBeNull()
  })

  test("unwraps a value pasted straight out of a .env file", () => {
    setEnv(KEY, '"postgresql://user:pw@host/db"')
    expect(readEnv(KEY)).toBe("postgresql://user:pw@host/db")
  })
})

describe("readEnvList", () => {
  test("splits on commas and tolerates whitespace", () => {
    setEnv(KEY, " a , b ,, c ")
    expect(readEnvList(KEY)).toEqual(["a", "b", "c"])
  })

  test("survives the whole list being quoted, which is how a dashboard stores it", () => {
    setEnv(KEY, '"tobimocc@gmail.com,tobias@basement.studio"')

    expect(readEnvList(KEY)).toEqual([
      "tobimocc@gmail.com",
      "tobias@basement.studio",
    ])
  })

  test("survives each entry being quoted individually", () => {
    setEnv(KEY, '"a@b.com", "c@d.com"')

    expect(readEnvList(KEY)).toEqual(["a@b.com", "c@d.com"])
  })

  test("returns an empty list when unset", () => {
    setEnv(KEY, undefined)
    expect(readEnvList(KEY)).toEqual([])
  })
})
