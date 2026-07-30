"use client"

import { createContext, type ReactNode, useContext } from "react"

/**
 * Marks a subtree as the properties sidebar's invisible height-measuring mirror.
 *
 * The sidebar renders its content several times — once visibly and once per
 * measuring mirror (mobile + desktop) — so anything interactive inside it is
 * duplicated. That was mounting ~75 redundant popover roots and store
 * subscriptions once every parameter row gained an audio-link button.
 *
 * Components can use {@link useIsMeasuringLayout} to render a plain, same-sized
 * placeholder instead, keeping the measured height correct without the machinery.
 */
const MeasuringLayoutContext = createContext(false)

export function MeasuringLayoutProvider({
  children,
}: {
  children: ReactNode
}) {
  return (
    <MeasuringLayoutContext.Provider value={true}>
      {children}
    </MeasuringLayoutContext.Provider>
  )
}

export function useIsMeasuringLayout(): boolean {
  return useContext(MeasuringLayoutContext)
}
