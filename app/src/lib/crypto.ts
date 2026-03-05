import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 } from 'tweetnacl-util'

export type EncryptedPayload = {
  ciphertext: string
  nonce: string
  senderPublicKey: string
}

export type SymmetricEncrypted = {
  ciphertext: string
  nonce: string
}

async function hkdf(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length: number
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const ikmBuffer = new Uint8Array(ikm).buffer as ArrayBuffer
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    ikmBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const prk = new Uint8Array(
    await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(salt))
  )

  const prkKey = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const infoBytes = encoder.encode(info)
  const input = new Uint8Array(infoBytes.length + 1)
  input.set(infoBytes)
  input[infoBytes.length] = 1

  const okm = new Uint8Array(
    await crypto.subtle.sign('HMAC', prkKey, input)
  )
  return okm.slice(0, length)
}

export async function deriveEncryptionKeypair(walletSignature: Uint8Array): Promise<{
  publicKey: Uint8Array
  secretKey: Uint8Array
}> {
  const seed = await hkdf(walletSignature, 'RootGraph', 'encryption-v1', 32)
  const keypair = nacl.box.keyPair.fromSecretKey(seed)
  return { publicKey: keypair.publicKey, secretKey: keypair.secretKey }
}

export async function deriveSalaryKey(walletSignature: Uint8Array): Promise<Uint8Array> {
  return hkdf(walletSignature, 'RootGraph', 'salary-encryption-v1', 32)
}

export function encryptForRecipient(
  message: string,
  senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  context: string
): EncryptedPayload {
  const nonce = nacl.randomBytes(24)
  const contextBound = context + ':' + message
  const messageBytes = decodeUTF8(contextBound)
  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey)
  if (!ciphertext) throw new Error('Encryption failed')

  const senderKeypair = nacl.box.keyPair.fromSecretKey(senderSecretKey)
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    senderPublicKey: encodeBase64(senderKeypair.publicKey),
  }
}

export function decryptFromSender(
  encrypted: EncryptedPayload,
  recipientSecretKey: Uint8Array,
  senderPublicKey: Uint8Array,
  context: string
): string | null {
  try {
    const ciphertext = decodeBase64(encrypted.ciphertext)
    const nonce = decodeBase64(encrypted.nonce)
    const plaintext = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey)
    if (!plaintext) return null

    const decoded = encodeUTF8(plaintext)
    const prefix = context + ':'
    if (!decoded.startsWith(prefix)) return null
    return decoded.slice(prefix.length)
  } catch {
    return null
  }
}

export function encryptSymmetric(plaintext: string, key: Uint8Array): SymmetricEncrypted {
  const nonce = nacl.randomBytes(24)
  const messageBytes = decodeUTF8(plaintext)
  const ciphertext = nacl.secretbox(messageBytes, nonce, key)
  if (!ciphertext) throw new Error('Symmetric encryption failed')
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  }
}

export function decryptSymmetric(encrypted: SymmetricEncrypted, key: Uint8Array): string | null {
  try {
    const ciphertext = decodeBase64(encrypted.ciphertext)
    const nonce = decodeBase64(encrypted.nonce)
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key)
    if (!plaintext) return null
    return encodeUTF8(plaintext)
  } catch {
    return null
  }
}

export function bytesToBase64(key: Uint8Array): string {
  return encodeBase64(key)
}

export function base64ToBytes(b64: string): Uint8Array {
  return decodeBase64(b64)
}

export function signatureToBytes(signature: string): Uint8Array {
  const hex = signature.startsWith('0x') ? signature.slice(2) : signature
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
