import type { Noir } from '@noir-lang/noir_js'
import type { BarretenbergBackend } from '@noir-lang/backend_barretenberg'
import { bytesToBase64, base64ToBytes } from '@/lib/crypto'

let initPromise: Promise<{ noir: Noir; backend: BarretenbergBackend }> | null = null

async function doInitNoir(): Promise<{ noir: Noir; backend: BarretenbergBackend }> {
  const { Noir: NoirClass } = await import('@noir-lang/noir_js')
  const { BarretenbergBackend: BBBackend } = await import('@noir-lang/backend_barretenberg')

  const circuitResponse = await fetch('/circuits/salary_range.json')
  const circuit = await circuitResponse.json()

  const backend = new BBBackend(circuit)
  const noir = new NoirClass(circuit)
  return { noir, backend }
}

function initNoir() {
  if (!initPromise) {
    initPromise = doInitNoir()
  }
  return initPromise
}

export async function generateSalaryRangeProof(
  salary: number,
  rangeMin: number,
  rangeMax: number
): Promise<{ proof: string; publicInputs: string }> {
  const { noir, backend } = await initNoir()

  const { witness } = await noir.execute({
    salary: salary.toString(),
    range_min: rangeMin.toString(),
    range_max: rangeMax.toString(),
  })

  const proofData = await backend.generateProof(witness)

  return {
    proof: bytesToBase64(proofData.proof),
    publicInputs: JSON.stringify(proofData.publicInputs),
  }
}

export async function verifySalaryRangeProof(
  proof: string,
  publicInputs: string
): Promise<boolean> {
  try {
    const { backend } = await initNoir()

    const proofBytes = base64ToBytes(proof)
    const inputs = JSON.parse(publicInputs) as string[]

    return await backend.verifyProof({
      proof: proofBytes,
      publicInputs: inputs,
    })
  } catch {
    return false
  }
}

export function formatSalaryRange(rangeMin: number, rangeMax: number, currency: string): string {
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`
    return n.toString()
  }
  const symbol = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'
  return `${symbol}${fmt(rangeMin)} - ${symbol}${fmt(rangeMax)}`
}

export function calculateSalaryRange(amount: number): { rangeMin: number; rangeMax: number } {
  if (amount <= 50000) {
    const min = Math.floor(amount / 25000) * 25000
    return { rangeMin: min, rangeMax: min + 25000 }
  }
  const min = Math.floor(amount / 50000) * 50000
  return { rangeMin: min, rangeMax: min + 50000 }
}
