"use client"

import { createContext, type ReactNode, useContext } from "react"

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
