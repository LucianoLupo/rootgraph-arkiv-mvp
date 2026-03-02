'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { type ReactNode } from 'react'

const kaolinChain = {
  id: 60138453025,
  name: 'Kaolin',
  network: 'kaolin',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://kaolin.hoodi.arkiv.network/rpc'] },
  },
}

export function AppPrivyProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId || appId.startsWith('placeholder')) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-4xl">🔗</div>
          <h1 className="text-2xl font-bold text-white">RootGraph × Arkiv</h1>
          <p className="text-gray-400">
            Set a valid <code className="text-emerald-400">NEXT_PUBLIC_PRIVY_APP_ID</code> in{' '}
            <code className="text-emerald-400">.env.local</code> to enable authentication.
          </p>
          <p className="text-gray-500 text-sm">
            Get one free at{' '}
            <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">
              dashboard.privy.io
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supportedChains: [kaolinChain as any],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultChain: kaolinChain as any,
      }}
    >
      {children}
    </PrivyProvider>
  )
}
