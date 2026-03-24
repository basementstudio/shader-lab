export const easings = {
  easeInOutCubic: (x: number): number =>
    x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2,
}
