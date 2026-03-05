'use client'

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  deriveEncryptionKeypair,
  deriveSalaryKey,
  signatureToBytes,
  bytesToBase64,
  base64ToBytes,
} from '@/lib/crypto'

type CryptoContextType = {
  publicKey: Uint8Array | null
  secretKey: Uint8Array | null
  salaryKey: Uint8Array | null
  publicKeyBase64: string | null
  isEncryptionEnabled: boolean
  isInitializing: boolean
  promptForSignature: () => Promise<void>
}

export const CryptoContext = createContext<CryptoContextType | null>(null)

const DERIVATION_MESSAGE = 'RootGraph Encryption Key v1'
const SESSION_KEY_PREFIX = 'rg_crypto_'

function cacheKeys(wallet: string, publicKey: Uint8Array, secretKey: Uint8Array, salaryKey: Uint8Array) {
  const data = {
    publicKey: bytesToBase64(publicKey),
    secretKey: bytesToBase64(secretKey),
    salaryKey: bytesToBase64(salaryKey),
  }
  sessionStorage.setItem(SESSION_KEY_PREFIX + wallet.toLowerCase(), JSON.stringify(data))
}

function loadCachedKeys(wallet: string): { publicKey: Uint8Array; secretKey: Uint8Array; salaryKey: Uint8Array } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + wallet.toLowerCase())
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      publicKey: base64ToBytes(data.publicKey),
      secretKey: base64ToBytes(data.secretKey),
      salaryKey: base64ToBytes(data.salaryKey),
    }
  } catch {
    return null
  }
}

type KeyState = {
  publicKey: Uint8Array
  secretKey: Uint8Array
  salaryKey: Uint8Array
}

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { wallets } = useWallets()
  const [keys, setKeys] = useState<KeyState | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const wallet = wallets[0]

  const deriveKeys = useCallback(async (signatureFn: () => Promise<string>) => {
    try {
      const signature = await signatureFn()
      const sigBytes = signatureToBytes(signature)
      const keypair = await deriveEncryptionKeypair(sigBytes)
      const salKey = await deriveSalaryKey(sigBytes)

      const derived = { publicKey: keypair.publicKey, secretKey: keypair.secretKey, salaryKey: salKey }
      setKeys(derived)

      if (wallet?.address) {
        cacheKeys(wallet.address, keypair.publicKey, keypair.secretKey, salKey)
      }
    } catch (err) {
      console.error('Failed to derive encryption keys:', err)
    }
  }, [wallet?.address])

  useEffect(() => {
    setKeys(null)

    if (!wallet?.address) {
      setIsInitializing(false)
      return
    }

    const cached = loadCachedKeys(wallet.address)
    if (cached) {
      setKeys(cached)
    }

    setIsInitializing(false)
  }, [wallet?.address])

  const promptForSignature = useCallback(async () => {
    if (!wallet || wallet.type !== 'ethereum') return
    const provider = await wallet.getEthereumProvider()
    await deriveKeys(async () => {
      const result = await provider.request({
        method: 'personal_sign',
        params: [
          '0x' + Array.from(new TextEncoder().encode(DERIVATION_MESSAGE))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          wallet.address,
        ],
      })
      return result as string
    })
  }, [wallet, deriveKeys])

  return (
    <CryptoContext.Provider
      value={{
        publicKey: keys?.publicKey ?? null,
        secretKey: keys?.secretKey ?? null,
        salaryKey: keys?.salaryKey ?? null,
        publicKeyBase64: keys ? bytesToBase64(keys.publicKey) : null,
        isEncryptionEnabled: keys !== null,
        isInitializing,
        promptForSignature,
      }}
    >
      {children}
    </CryptoContext.Provider>
  )
}
