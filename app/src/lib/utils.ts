import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateWallet(addr: string) {
  if (addr.length > 12) return `${addr.slice(0, 6)}…${addr.slice(-4)}`
  return addr
}
