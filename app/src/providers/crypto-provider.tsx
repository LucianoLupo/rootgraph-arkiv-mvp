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
  publicKeyToBase64,
  base64ToPublicKey,
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
    publicKey: publicKeyToBase64(publicKey),
    secretKey: publicKeyToBase64(secretKey),
    salaryKey: publicKeyToBase64(salaryKey),
  }
  sessionStorage.setItem(SESSION_KEY_PREFIX + wallet.toLowerCase(), JSON.stringify(data))
}

function loadCachedKeys(wallet: string): { publicKey: Uint8Array; secretKey: Uint8Array; salaryKey: Uint8Array } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + wallet.toLowerCase())
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      publicKey: base64ToPublicKey(data.publicKey),
      secretKey: base64ToPublicKey(data.secretKey),
      salaryKey: base64ToPublicKey(data.salaryKey),
    }
  } catch {
    return null
  }
}

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { wallets } = useWallets()
  const [publicKey, setPublicKey] = useState<Uint8Array | null>(null)
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [salaryKey, setSalaryKey] = useState<Uint8Array | null>(null)
  const [publicKeyBase64, setPublicKeyBase64] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const wallet = wallets[0]

  const deriveKeys = useCallback(async (signatureFn: () => Promise<string>) => {
    try {
      const signature = await signatureFn()
      const sigBytes = signatureToBytes(signature)
      const keypair = await deriveEncryptionKeypair(sigBytes)
      const salKey = await deriveSalaryKey(sigBytes)

      setPublicKey(keypair.publicKey)
      setSecretKey(keypair.secretKey)
      setSalaryKey(salKey)
      setPublicKeyBase64(publicKeyToBase64(keypair.publicKey))

      if (wallet?.address) {
        cacheKeys(wallet.address, keypair.publicKey, keypair.secretKey, salKey)
      }
    } catch (err) {
      console.error('Failed to derive encryption keys:', err)
    }
  }, [wallet?.address])

  useEffect(() => {
    setPublicKey(null)
    setSecretKey(null)
    setSalaryKey(null)
    setPublicKeyBase64(null)

    if (!wallet?.address) {
      setIsInitializing(false)
      return
    }

    const cached = loadCachedKeys(wallet.address)
    if (cached) {
      setPublicKey(cached.publicKey)
      setSecretKey(cached.secretKey)
      setSalaryKey(cached.salaryKey)
      setPublicKeyBase64(publicKeyToBase64(cached.publicKey))
      setIsInitializing(false)
      return
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
        publicKey,
        secretKey,
        salaryKey,
        publicKeyBase64,
        isEncryptionEnabled: publicKey !== null && secretKey !== null,
        isInitializing,
        promptForSignature,
      }}
    >
      {children}
    </CryptoContext.Provider>
  )
}
