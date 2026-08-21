let depth = 0
let restoreDepth = 0

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

export function isRestoringAutosave(): boolean {
  return restoreDepth > 0
}

export function withAutosaveRestore<T>(run: () => T): T {
  restoreDepth += 1

  try {
    return withAutosaveSuppressed(run)
  } finally {
    restoreDepth -= 1
  }
}
