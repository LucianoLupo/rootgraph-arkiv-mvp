'use client'

import { useContext, useCallback } from 'react'
import { CryptoContext } from '@/providers/crypto-provider'
import {
  encryptForRecipient,
  decryptFromSender,
  encryptSymmetric,
  decryptSymmetric,
  base64ToPublicKey,
  type EncryptedPayload,
  type SymmetricEncrypted,
} from '@/lib/crypto'
import { getProfile } from '@/lib/arkiv'

export function useCrypto() {
  const ctx = useContext(CryptoContext)
  if (!ctx) {
    throw new Error('useCrypto must be used within a CryptoProvider')
  }

  const encryptForWallet = useCallback(
    async (
      message: string,
      recipientWallet: string,
      context: string
    ): Promise<EncryptedPayload | null> => {
      if (!ctx.secretKey) return null

      const profile = await getProfile(recipientWallet)
      if (!profile?.encryptionPublicKey) return null

      const recipientPubKey = base64ToPublicKey(profile.encryptionPublicKey)
      return encryptForRecipient(message, ctx.secretKey, recipientPubKey, context)
    },
    [ctx.secretKey]
  )

  const decryptMessage = useCallback(
    (
      encrypted: EncryptedPayload,
      senderPublicKeyBase64: string,
      context: string
    ): string | null => {
      if (!ctx.secretKey) return null
      const senderPubKey = base64ToPublicKey(senderPublicKeyBase64)
      return decryptFromSender(encrypted, ctx.secretKey, senderPubKey, context)
    },
    [ctx.secretKey]
  )

  const encryptSalary = useCallback(
    (amount: string): SymmetricEncrypted | null => {
      if (!ctx.salaryKey) return null
      return encryptSymmetric(amount, ctx.salaryKey)
    },
    [ctx.salaryKey]
  )

  const decryptSalary = useCallback(
    (encrypted: SymmetricEncrypted): string | null => {
      if (!ctx.salaryKey) return null
      return decryptSymmetric(encrypted, ctx.salaryKey)
    },
    [ctx.salaryKey]
  )

  return {
    ...ctx,
    encryptForWallet,
    decryptMessage,
    encryptSalary,
    decryptSalary,
  }
}
