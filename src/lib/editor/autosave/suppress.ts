let depth = 0

export function isAutosaveSuppressed(): boolean {
  return depth > 0
}

export function withAutosaveSuppressed<T>(run: () => T): T {
  depth += 1

  try {
    return run()
  } finally {
    depth -= 1
  }
}
