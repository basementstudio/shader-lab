const EDITABLE_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"])

function isEditableElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  if (EDITABLE_TAG_NAMES.has(element.tagName)) {
    return true
  }

  // A global shortcut must never fire while a popover or dialog owns the
  // interaction. Without this, a destructive binding (Delete removes the
  // selected layer) fires whenever focus lands somewhere unexpected inside an
  // overlay — e.g. a popover that keeps focus on its trigger, so typing in one
  // of its number fields and pressing Delete would delete the layer instead of
  // a character.
  return element.closest("[role='dialog'], [role='menu'], [role='listbox']") !== null
}

/**
 * Whether a keyboard event should be left alone by global editor shortcuts.
 *
 * Checks both the event target and the active element: the two can disagree when
 * an overlay manages focus, and the *destructive* shortcuts are the ones that
 * must not guess.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const eventElement = target instanceof HTMLElement ? target : null
  const activeElement =
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement

  return isEditableElement(eventElement) || isEditableElement(activeElement)
}
