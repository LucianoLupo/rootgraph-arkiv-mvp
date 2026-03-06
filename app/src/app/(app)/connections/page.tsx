'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import { acceptConnection } from '@/lib/arkiv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { truncateWallet } from '@/lib/utils';
import { Check, Clock, Users, Send, Search, Loader2, ExternalLink } from 'lucide-react';

export default function ConnectionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();

  const profile = useAppStore((s) => s.profile);
  const connections = useAppStore((s) => s.connections);
  const connectionsLoading = useAppStore((s) => s.connectionsLoading);
  const incomingRequests = useAppStore((s) => s.incomingRequests);
  const outgoingRequests = useAppStore((s) => s.outgoingRequests);
  const requestsLoading = useAppStore((s) => s.requestsLoading);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const profileMap = useAppStore((s) => s.profileMap);
  const refreshAll = useAppStore((s) => s.refreshAll);

  const [acceptingFrom, setAcceptingFrom] = useState<string | null>(null);

  const handleAccept = async (fromWallet: string) => {
    if (!walletClient || !walletAddress) return;
    setAcceptingFrom(fromWallet);
    try {
      await acceptConnection(walletClient, fromWallet, walletAddress);
      toast({ title: 'Connection accepted!' });
      refreshAll(walletAddress);
    } catch (err) {
      console.error('Failed to accept:', err);
      toast({ title: 'Failed to accept connection', variant: 'destructive' });
    } finally {
      setAcceptingFrom(null);
    }
  };

  const myWallet = profile?.wallet ?? walletAddress ?? '';

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your trust network
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
          onClick={() => router.push('/search')}
        >
          <Search className="w-4 h-4 mr-2" />
          Find people
        </Button>
      </div>

      <Tabs defaultValue="connected" className="w-full">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger
            value="connected"
            className="data-[state=active]:bg-border data-[state=active]:text-white text-sm font-medium"
          >
            <Users className="w-4 h-4 mr-2" />
            Connected
            <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground text-[10px]">
              {connections.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="data-[state=active]:bg-border data-[state=active]:text-white text-sm font-medium"
          >
            <Send className="w-4 h-4 mr-2" />
            Pending
            {(incomingRequests.length + outgoingRequests.length) > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-foreground text-[10px]">
                {incomingRequests.length + outgoingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Connected Tab */}
        <TabsContent value="connected" className="mt-4 space-y-3">
          {connectionsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-foreground" />
            </div>
          ) : connections.length === 0 ? (
            <Card className="rounded-lg border border-border bg-card">
              <CardContent className="py-12 text-center">
                <Users className="w-10 h-10 text-border mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No connections yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Search for people and start building your trust graph
                </p>
              </CardContent>
            </Card>
          ) : (
            connections.map((conn) => {
              const otherWallet = conn.userA === myWallet ? conn.userB : conn.userA;
              const otherProfile = profileMap.get(otherWallet);
              const displayName = otherProfile?.displayName || otherProfile?.username || truncateWallet(otherWallet);
              const subtitle = otherProfile?.position ? `${otherProfile.position}` : 'On-chain connection';
              const initials = (otherProfile?.displayName || otherWallet.slice(2, 4)).slice(0, 2).toUpperCase();
              return (
                <Card
                  key={conn.entityKey}
                  className="rounded-lg border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/profile/${otherWallet}`)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-11 h-11">
                        <AvatarFallback className="bg-primary/10 text-foreground font-bold text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{displayName}</p>
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {conn.createdAt
                            ? new Date(conn.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Connected'}
                        </div>
                        <a
                          href={`https://explorer.kaolin.hoodi.arkiv.network/address/${otherWallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="View on Arkiv Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4 space-y-6">
          {requestsLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-foreground" />
            </div>
          )}
          {!requestsLoading && <>
          {/* Incoming */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-foreground" />
              Incoming requests ({incomingRequests.length})
            </h3>
            {incomingRequests.length === 0 ? (
              <Card className="rounded-lg border border-border bg-card">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  No incoming requests
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((req) => {
                  const fromProfile = profileMap.get(req.from);
                  const fromName = fromProfile?.displayName || fromProfile?.username || truncateWallet(req.from);
                  const fromInitials = (fromProfile?.displayName || req.from.slice(2, 4)).slice(0, 2).toUpperCase();
                  return (
                  <Card key={req.entityKey} className="rounded-lg border border-border bg-card">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <Avatar className="w-11 h-11 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-foreground font-bold text-xs">
                            {fromInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{fromName}</p>
                          {req.message && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              &ldquo;{req.message}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
                            disabled={acceptingFrom === req.from}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAccept(req.from);
                            }}
                          >
                            {acceptingFrom === req.from ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><Check className="w-4 h-4 mr-1" /> Accept</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outgoing */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted-foreground" />
              Outgoing requests ({outgoingRequests.length})
            </h3>
            {outgoingRequests.length === 0 ? (
              <Card className="rounded-lg border border-border bg-card">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  No outgoing requests
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((req) => {
                  const toProfile = profileMap.get(req.to);
                  const toName = toProfile?.displayName || toProfile?.username || truncateWallet(req.to);
                  const toInitials = (toProfile?.displayName || req.to.slice(2, 4)).slice(0, 2).toUpperCase();
                  return (
                  <Card key={req.entityKey} className="rounded-lg border border-border bg-card">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-11 h-11">
                          <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xs">
                            {toInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{toName}</p>
                          <p className="text-xs text-muted-foreground">
                            Sent {req.createdAt
                              ? new Date(req.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'recently'}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          Pending
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
          </>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
