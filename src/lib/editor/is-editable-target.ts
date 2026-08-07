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

  return element.closest("[role='dialog'], [role='menu'], [role='listbox']") !== null
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const eventElement = target instanceof HTMLElement ? target : null
  const activeElement =
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement

  return isEditableElement(eventElement) || isEditableElement(activeElement)
}
