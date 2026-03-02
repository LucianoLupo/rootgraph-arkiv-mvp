'use client'

import { useContext } from 'react'
import { ArkivContext } from '@/providers/arkiv-provider'

export function useArkiv() {
  const context = useContext(ArkivContext)
  if (!context) {
    throw new Error('useArkiv must be used within an ArkivProvider')
  }
  return context
}
