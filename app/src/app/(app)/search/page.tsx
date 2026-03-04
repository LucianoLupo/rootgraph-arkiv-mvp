'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import {
  searchProfiles,
  sendConnectionRequest,
  isConnected,
  type ProfileData,
} from '@/lib/arkiv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search as SearchIcon, UserPlus, Check, Clock, Loader2 } from 'lucide-react';

type ConnectionStatus = 'none' | 'connected' | 'pending';

interface SearchResult extends ProfileData {
  entityKey: string;
  wallet: string;
  connectionStatus: ConnectionStatus;
}

export default function SearchPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const walletAddress = useAppStore((s) => s.walletAddress);
  const outgoingRequests = useAppStore((s) => s.outgoingRequests);
  const refreshAll = useAppStore((s) => s.refreshAll);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectDialogTarget, setConnectDialogTarget] = useState<string | null>(null);
  const [connectMessage, setConnectMessage] = useState('');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);

    try {
      const profiles = await searchProfiles(query);
      const enriched: SearchResult[] = await Promise.all(
        profiles
          .filter((p) => p.wallet !== walletAddress?.toLowerCase())
          .map(async (p) => {
            let status: ConnectionStatus = 'none';
            if (walletAddress) {
              const connected = await isConnected(walletAddress, p.wallet);
              if (connected) {
                status = 'connected';
              } else if (outgoingRequests.some((r) => r.to === p.wallet)) {
                status = 'pending';
              }
            }
            return { ...p, connectionStatus: status };
          })
      );
      setResults(enriched);
    } catch (err) {
      console.error('Search failed:', err);
      toast({ title: 'Search failed', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  }, [query, walletAddress, outgoingRequests, toast]);

  const openConnectDialog = (targetWallet: string) => {
    setConnectDialogTarget(targetWallet);
    setConnectMessage('');
  };

  const handleConnect = async () => {
    if (!walletClient || !walletAddress || !connectDialogTarget) return;
    const targetWallet = connectDialogTarget;
    setConnectingWallet(targetWallet);
    setConnectDialogTarget(null);
    try {
      await sendConnectionRequest(walletClient, walletAddress, targetWallet, connectMessage || undefined);
      toast({ title: 'Connection request sent!' });
      setResults((prev) =>
        prev.map((r) =>
          r.wallet === targetWallet ? { ...r, connectionStatus: 'pending' as ConnectionStatus } : r
        )
      );
      refreshAll(walletAddress);
    } catch (err) {
      console.error('Failed to send request:', err);
      toast({ title: 'Failed to send request', variant: 'destructive' });
    } finally {
      setConnectingWallet(null);
    }
  };

  const statusButton = (result: SearchResult) => {
    switch (result.connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider">
            <Check className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return (
          <Button
            size="sm"
            className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-[10px] tracking-wider"
            disabled={connectingWallet === result.wallet}
            onClick={(e) => {
              e.stopPropagation();
              openConnectDialog(result.wallet);
            }}
          >
            {connectingWallet === result.wallet ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <UserPlus className="w-3.5 h-3.5 mr-1" />
            )}
            CONNECT
          </Button>
        );
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">[ DISCOVER ]</h1>
        <p className="text-[#A0A0A0] text-xs mt-1 normal-case">
          Search by username to grow your trust network
        </p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
          <Input
            className="pl-10 bg-[#2A2A2E] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
            placeholder="SEARCH BY USERNAME, NAME, WALLET, OR TAG..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider px-6"
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
        >
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'SEARCH'
          )}
        </Button>
      </div>

      {isSearching && (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#FE7445] mx-auto mb-2" />
          <p className="text-xs text-[#666] uppercase tracking-wider">Searching on Arkiv...</p>
        </div>
      )}

      {!isSearching && hasSearched && results.length === 0 && (
        <div className="text-center py-12">
          <SearchIcon className="w-10 h-10 text-[#444] mx-auto mb-3" />
          <p className="text-[#A0A0A0] text-sm normal-case">No users found for &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-[#666] mt-1 normal-case">Try a different username</p>
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] text-[#666] uppercase tracking-wider">
            {results.length} result{results.length !== 1 && 's'} found
          </p>
          {results.map((result) => (
            <Card
              key={result.entityKey}
              className="bg-[#2A2A2E] border-[#333] hover:border-[#FE7445]/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/profile/${result.wallet}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-[#333] text-[#A0A0A0] font-bold text-xs">
                      {(result.displayName || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium normal-case">{result.displayName || 'Anonymous'}</p>
                    <p className="text-xs text-[#A0A0A0] normal-case">
                      {result.position}
                      {result.company && (
                        <span className="text-[#666]"> at {result.company}</span>
                      )}
                    </p>
                    {result.tags && result.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {result.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-[#FE7445]/10 text-[#FE7445] border border-[#FE7445]/30 text-[10px] px-1.5 py-0 uppercase tracking-wider"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">{statusButton(result)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!hasSearched && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#2A2A2E] border border-[#333] flex items-center justify-center mx-auto mb-4">
            <SearchIcon className="w-8 h-8 text-[#444]" />
          </div>
          <p className="text-[#A0A0A0] text-sm normal-case">Search for people on the network</p>
          <p className="text-xs text-[#666] mt-1 normal-case">
            Find and connect with professionals on the decentralized trust graph
          </p>
        </div>
      )}

      <Dialog open={!!connectDialogTarget} onOpenChange={(open) => { if (!open) setConnectDialogTarget(null); }}>
        <DialogContent className="bg-[#2A2A2E] border-[#333] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xs tracking-wider">SEND CONNECTION REQUEST</DialogTitle>
            <DialogDescription className="text-[#A0A0A0] text-xs normal-case">
              Add an optional message to introduce yourself.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-md bg-[#1A1A1A] border border-[#333] text-white placeholder:text-[#666] text-xs p-3 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-[#FE7445]/30 font-mono"
            placeholder="Hi! I'd love to connect..."
            value={connectMessage}
            onChange={(e) => setConnectMessage(e.target.value)}
            maxLength={200}
          />
          <p className="text-[10px] text-[#666] text-right">{connectMessage.length}/200</p>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-[#444] text-[#A0A0A0] text-xs font-bold tracking-wider"
              onClick={() => setConnectDialogTarget(null)}
            >
              CANCEL
            </Button>
            <Button
              className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider"
              onClick={handleConnect}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              SEND REQUEST
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
