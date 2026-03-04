'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getJobsByPoster, getApplicationsByApplicant, type Job } from '@/lib/arkiv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { truncateWallet } from '@/lib/utils';
import {
  Users,
  Search,
  ArrowRight,
  Clock,
  Briefcase,
  Send,
  UserPlus,
  Loader2,
  ExternalLink,
  Plus,
  Settings,
  Link,
  Check,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const profileLoading = useAppStore((s) => s.profileLoading);
  const connections = useAppStore((s) => s.connections);
  const profileMap = useAppStore((s) => s.profileMap);
  const incomingRequests = useAppStore((s) => s.incomingRequests);
  const outgoingRequests = useAppStore((s) => s.outgoingRequests);

  const walletAddress = useAppStore((s) => s.walletAddress);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [applicationCount, setApplicationCount] = useState(0);

  useEffect(() => {
    if (!walletAddress) return;
    Promise.all([
      getJobsByPoster(walletAddress),
      getApplicationsByApplicant(walletAddress),
    ]).then(([jobs, apps]) => {
      setMyJobs(jobs);
      setApplicationCount(apps.length);
    }).catch((err) => { console.error('Failed to load dashboard data:', err); });
  }, [walletAddress]);

  const [linkCopied, setLinkCopied] = useState(false);

  const copyProfileLink = useCallback(() => {
    if (!walletAddress) return;
    const url = `${window.location.origin}/profile/${walletAddress}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [walletAddress]);

  const pendingCount = incomingRequests.length + outgoingRequests.length;
  const totalConnections = connections.length;

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#FE7445]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <div className="w-20 h-20 rounded-2xl bg-[#FE7445]/10 flex items-center justify-center mb-6">
          <UserPlus className="w-10 h-10 text-[#FE7445]" />
        </div>
        <h1 className="text-2xl font-bold mb-2">WELCOME TO ROOTGRAPH</h1>
        <p className="text-[#A0A0A0] text-center max-w-md mb-8 text-sm normal-case">
          Create your profile to start building your decentralized trust graph.
          Your data lives on-chain, owned by you.
        </p>
        <Button
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider"
          onClick={() => router.push('/settings')}
        >
          <Settings className="w-4 h-4 mr-2" />
          CREATE YOUR PROFILE
        </Button>
      </div>
    );
  }

  const displayName = profile.displayName || profile.wallet;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">[ DASHBOARD ]</h1>
          <p className="text-[#A0A0A0] text-xs mt-1 normal-case">
            Welcome back, {displayName}
          </p>
        </div>
      </div>

      {/* Profile Card + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <Card className="bg-[#2A2A2E] border-[#333] lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-16 h-16 mb-4">
                <AvatarFallback className="bg-[#FE7445]/20 text-[#FE7445] text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold normal-case">{displayName}</h3>
              {profile.position && (
                <p className="text-xs text-[#666] mt-1 normal-case">
                  {profile.position}
                  {profile.company && ` at ${profile.company}`}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {(profile.tags ?? []).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-[#FE7445]/10 text-[#FE7445] border border-[#FE7445]/30 text-[10px] uppercase tracking-wider"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#444] text-[#A0A0A0] hover:text-white text-xs font-bold tracking-wider"
                  onClick={() => router.push('/settings')}
                >
                  EDIT PROFILE
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#444] text-[#A0A0A0] hover:text-white text-xs font-bold tracking-wider"
                  onClick={copyProfileLink}
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5 mr-1.5 text-[#FE7445]" /> : <Link className="w-3.5 h-3.5 mr-1.5" />}
                  {linkCopied ? 'COPIED!' : 'SHARE PROFILE'}
                </Button>
              </div>
              <a
                href={`https://explorer.kaolin.hoodi.arkiv.network/address/${profile.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-2 text-[10px] text-[#666] hover:text-[#FE7445] transition-colors uppercase tracking-wider"
              >
                <ExternalLink className="w-3 h-3" />
                View on Arkiv Explorer
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-[#2A2A2E] border-[#333]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FE7445]/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#FE7445]" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalConnections}</p>
                  <p className="text-xs text-[#A0A0A0] uppercase tracking-wider">Connections</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2A2A2E] border-[#333]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FE7445]/10 flex items-center justify-center">
                  <Send className="w-5 h-5 text-[#FE7445]" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-[#A0A0A0] uppercase tracking-wider">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2A2A2E] border-[#333]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FE7445]/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-[#FE7445]" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{myJobs.length}</p>
                  <p className="text-xs text-[#A0A0A0] uppercase tracking-wider">Jobs Posted</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2A2A2E] border-[#333]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FE7445]/10 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-[#FE7445]" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{applicationCount}</p>
                  <p className="text-xs text-[#A0A0A0] uppercase tracking-wider">Applied</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardHeader>
            <CardTitle className="text-xs tracking-wider">[ QUICK ACTIONS ]</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-between border-[#444] text-[#A0A0A0] hover:text-white hover:bg-[#333] text-xs font-bold tracking-wider"
              onClick={() => router.push('/jobs')}
            >
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                BROWSE JOBS
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between border-[#444] text-[#A0A0A0] hover:text-white hover:bg-[#333] text-xs font-bold tracking-wider"
              onClick={() => router.push('/jobs/post')}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                POST A JOB
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between border-[#444] text-[#A0A0A0] hover:text-white hover:bg-[#333] text-xs font-bold tracking-wider"
              onClick={() => router.push('/search')}
            >
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                FIND PEOPLE
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between border-[#444] text-[#A0A0A0] hover:text-white hover:bg-[#333] text-xs font-bold tracking-wider"
              onClick={() => router.push('/connections')}
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                MANAGE CONNECTIONS
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardHeader>
            <CardTitle className="text-xs tracking-wider">[ RECENT CONNECTIONS ]</CardTitle>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-xs text-[#666] text-center py-4 normal-case">
                No connections yet. Start networking!
              </p>
            ) : (
              <div className="space-y-3">
                {connections.slice(0, 5).map((conn) => {
                  const otherWallet = conn.userA === profile.wallet ? conn.userB : conn.userA;
                  const otherProfile = profileMap.get(otherWallet);
                  const displayLabel = otherProfile?.displayName || otherProfile?.username || truncateWallet(otherWallet);
                  const initials = (otherProfile?.displayName || otherWallet.slice(2, 4)).slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={conn.entityKey}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#333] cursor-pointer transition-colors"
                      onClick={() => router.push(`/profile/${otherWallet}`)}
                    >
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="bg-[#333] text-[#A0A0A0] text-xs font-bold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium normal-case">{displayLabel}</p>
                        <p className="text-[10px] text-[#666] uppercase tracking-wider">Connected</p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[#666]">
                        <Clock className="w-3 h-3" />
                        {conn.createdAt
                          ? new Date(conn.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Recent'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
