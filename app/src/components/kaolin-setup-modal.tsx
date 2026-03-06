'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Copy, ExternalLink, Loader2, Wallet, Droplets, Shield } from 'lucide-react';

const KAOLIN_CHAIN = {
  chainId: '0xE02515A01',
  chainName: 'Kaolin',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://kaolin.hoodi.arkiv.network/rpc'],
  blockExplorerUrls: ['https://explorer.kaolin.hoodi.arkiv.network'],
};

const FAUCET_URL = 'https://kaolin.hoodi.arkiv.network/faucet/';

interface KaolinSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress?: string;
}

export function KaolinSetupModal({ open, onOpenChange, walletAddress }: KaolinSetupModalProps) {
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<'success' | 'error' | null>(null);
  const [copied, setCopied] = useState(false);

  const addChain = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    setAdding(true);
    setAddResult(null);
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [KAOLIN_CHAIN],
      });
      setAddResult('success');
    } catch {
      setAddResult('error');
    } finally {
      setAdding(false);
    }
  };

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-foreground">
            Kaolin network setup
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs normal-case">
            Follow these steps to transact on the Kaolin testnet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Section 1: Add Chain */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-medium">1. Add Kaolin network</h3>
            </div>
            <p className="text-xs text-muted-foreground normal-case">
              Add the Kaolin chain to MetaMask or your browser wallet.
            </p>
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              onClick={addChain}
              disabled={adding || addResult === 'success'}
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : addResult === 'success' ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Wallet className="w-4 h-4 mr-2" />
              )}
              {adding ? 'Adding...' : addResult === 'success' ? 'Added' : 'Add Kaolin to wallet'}
            </Button>
            {addResult === 'error' && (
              <p className="text-xs text-red-400 normal-case">
                Failed to add chain. Make sure you have a browser wallet installed.
              </p>
            )}
          </div>

          {/* Section 2: Get Testnet ETH */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-medium">2. Get testnet ETH</h3>
            </div>
            <p className="text-xs text-muted-foreground normal-case">
              Use the faucet to get free testnet ETH for transactions.
            </p>
            {walletAddress && (
              <div className="flex items-center gap-2 bg-input border border-border rounded px-3 py-2">
                <code className="text-xs text-muted-foreground font-mono truncate flex-1">
                  {walletAddress}
                </code>
                <button
                  onClick={copyAddress}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Copy address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-foreground" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className="w-full border-border text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open faucet
              </Button>
            </a>
          </div>

          {/* Section 3: Embedded Wallet Note */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-medium">Embedded wallet users</h3>
            </div>
            <p className="text-xs text-muted-foreground normal-case">
              If you signed in with Google (Privy), the Kaolin network is already configured.
              You only need testnet ETH from the faucet above.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
