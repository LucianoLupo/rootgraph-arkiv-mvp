'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import {
  getProfile,
  isConnected,
  sendConnectionRequest,
  type ProfileData,
} from '@/lib/arkiv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { truncateWallet } from '@/lib/utils';
import {
  UserPlus,
  Check,
  Clock,
  ExternalLink,
  ArrowLeft,
  Briefcase,
  MapPin,
  Loader2,
} from 'lucide-react';

type ConnectionStatus = 'none' | 'connected' | 'pending' | 'loading';

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const walletAddress = useAppStore((s) => s.walletAddress);
  const outgoingRequests = useAppStore((s) => s.outgoingRequests);
  const refreshAll = useAppStore((s) => s.refreshAll);

  const targetWallet = params.wallet as string;

  const [profile, setProfile] = useState<(ProfileData & { entityKey: string; wallet: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [connecting, setConnecting] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const p = await getProfile(targetWallet);
        if (p) {
          setProfile({ ...p, wallet: targetWallet });
        }

        if (walletAddress && walletAddress !== targetWallet) {
          const connected = await isConnected(walletAddress, targetWallet);
          if (connected) {
            setConnectionStatus('connected');
          } else {
            setConnectionStatus('none');
          }
        } else {
          setConnectionStatus('none');
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [targetWallet, walletAddress]);

  useEffect(() => {
    if (connectionStatus === 'none' && outgoingRequests.some((r) => r.to === targetWallet.toLowerCase())) {
      setConnectionStatus('pending');
    }
  }, [connectionStatus, outgoingRequests, targetWallet]);

  const handleConnect = async () => {
    if (!walletClient || !walletAddress) return;
    setConnectDialogOpen(false);
    setConnecting(true);
    try {
      await sendConnectionRequest(walletClient, walletAddress, targetWallet, connectMessage || undefined);
      setConnectionStatus('pending');
      toast({ title: 'Connection request sent!' });
      refreshAll(walletAddress);
    } catch (err) {
      console.error('Failed to connect:', err);
      toast({ title: 'Failed to send request', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const explorerUrl = `https://explorer.kaolin.hoodi.arkiv.network/address/${targetWallet}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-foreground" />
      </div>
    );
  }

  const displayName = profile?.displayName || truncateWallet(targetWallet);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <Card className="rounded-lg border border-border bg-card">
        <CardContent className="pt-8 pb-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="w-20 h-20 mb-4">
              <AvatarFallback className="bg-muted text-foreground text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <h1 className="text-xl font-bold normal-case">{displayName}</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {truncateWallet(targetWallet)}
            </p>

            {profile && (profile.position || profile.company) && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Briefcase className="w-3.5 h-3.5" />
                <span className="normal-case">
                  {profile.position}
                  {profile.company && (
                    <span className="text-muted-foreground"> at {profile.company}</span>
                  )}
                </span>
              </div>
            )}

            {profile && profile.tags && profile.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {profile.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-foreground border border-border text-xs"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-6">
              {connectionStatus === 'loading' ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : connectionStatus === 'connected' ? (
                <Badge
                  variant="outline"
                  className="border-border text-foreground px-4 py-1.5 text-xs"
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Connected
                </Badge>
              ) : connectionStatus === 'pending' ? (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground px-4 py-1.5 text-xs"
                >
                  <Clock className="w-3.5 h-3.5 mr-1.5" />
                  Request pending
                </Badge>
              ) : (
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
                  onClick={() => { setConnectMessage(''); setConnectDialogOpen(true); }}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Connect
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {connectionStatus === 'connected' && (
        <Card className="rounded-lg border border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Connection details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Trust level</span>
              <Badge variant="secondary" className="bg-primary/10 text-foreground text-xs">
                Direct
              </Badge>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className="text-muted-foreground normal-case">On-chain verified</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border border-border bg-card">
        <CardContent className="py-4">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <MapPin className="w-4 h-4" />
              View on Arkiv Explorer
            </span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </CardContent>
      </Card>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Send connection request</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs normal-case">
              Add an optional message to introduce yourself.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground text-xs p-3 min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            placeholder="Hi! I'd love to connect..."
            value={connectMessage}
            onChange={(e) => setConnectMessage(e.target.value)}
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground text-right">{connectMessage.length}/200</p>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border text-muted-foreground text-sm font-medium"
              onClick={() => setConnectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              onClick={handleConnect}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
