'use client'

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createArkivWalletClient } from '@/lib/arkiv'
import { useAppStore } from '@/lib/store'
import type { Hex } from '@arkiv-network/sdk'


type ArkivWalletClient = ReturnType<typeof createArkivWalletClient>

export const ArkivContext = createContext<{
  walletClient: ArkivWalletClient | null
  isReady: boolean
}>({
  walletClient: null,
  isReady: false,
})

export function ArkivProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const setWalletAddress = useAppStore((s) => s.setWalletAddress)
  const [walletClient, setWalletClient] = useState<ArkivWalletClient | null>(
    null
  )
  const [isReady, setIsReady] = useState(false)

  const initWalletClient = useCallback(async () => {
    if (!ready) {
      return
    }

    if (!authenticated || wallets.length === 0) {
      setWalletClient(null)
      setIsReady(true)
      return
    }

    const wallet = wallets[0]
    if (!wallet) {
      setIsReady(true)
      return
    }

    if (wallet.type !== 'ethereum') {
      // Non-ethereum wallet — no Arkiv client but still ready
      setWalletClient(null)
      setIsReady(true)
      return
    }

    try {
      // Switch to Kaolin chain before getting the provider
      await wallet.switchChain(60138453025)
      const provider = await wallet.getEthereumProvider()
      const client = createArkivWalletClient(provider, wallet.address as Hex)
      setWalletClient(client)
      setWalletAddress(wallet.address)
    } catch (err) {
      console.error('Failed to init Arkiv wallet client:', err)
    } finally {
      setIsReady(true)
    }
  }, [ready, authenticated, wallets, setWalletAddress])

  useEffect(() => {
    initWalletClient()
  }, [initWalletClient])

  return (
    <ArkivContext.Provider value={{ walletClient, isReady }}>
      {children}
    </ArkivContext.Provider>
  )
}
