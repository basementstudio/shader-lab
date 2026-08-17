const AUTOSAVE_RESUME_KEY = "shader-lab:autosave-resume"

export function markAutosaveResume(): void {
  try {
    window.sessionStorage.setItem(AUTOSAVE_RESUME_KEY, "1")
  } catch {
    return
  }
}

export function consumeAutosaveResume(): boolean {
  try {
    const marked = window.sessionStorage.getItem(AUTOSAVE_RESUME_KEY) === "1"

    window.sessionStorage.removeItem(AUTOSAVE_RESUME_KEY)

    return marked
  } catch {
    return false
  }
}
