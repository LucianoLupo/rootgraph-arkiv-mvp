'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import {
  getAllJobs,
  getProfile,
  getJobsByPoster,
  applyToJob,
  getApplicationsByApplicant,
  getApplicationsForJob,
  type Job,
  type Profile,
} from '@/lib/arkiv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatSalaryRange } from '@/lib/zk';
import {
  Briefcase,
  Plus,
  MapPin,
  Wifi,
  Search as SearchIcon,
  Loader2,
  Check,
  ExternalLink,
  Pencil,
  Users,
  CheckCircle,
  LogIn,
  DollarSign,
  Shield,
  ShieldAlert,
} from 'lucide-react';

export default function JobsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { authenticated, login } = usePrivy();
  const { walletClient } = useArkiv();
  const walletAddress = useAppStore((s) => s.walletAddress);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [posterProfiles, setPosterProfiles] = useState<Map<string, Profile>>(new Map());
  const [appliedJobKeys, setAppliedJobKeys] = useState<Set<string>>(new Set());
  const [myJobApplicationCounts, setMyJobApplicationCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [allJobs, applications, posterJobs] = await Promise.all([
        getAllJobs(),
        walletAddress ? getApplicationsByApplicant(walletAddress) : Promise.resolve([]),
        walletAddress ? getJobsByPoster(walletAddress) : Promise.resolve([]),
      ]);
      setJobs(allJobs);
      setMyJobs(posterJobs);
      setAppliedJobKeys(new Set(applications.map((a) => a.jobEntityKey)));

      const uniquePosters = Array.from(new Set(allJobs.map((j) => j.postedBy)));
      const profiles = await Promise.all(
        uniquePosters.map(async (wallet) => {
          const profile = await getProfile(wallet);
          return [wallet, profile] as const;
        })
      );
      const profileMap = new Map<string, Profile>();
      for (const [wallet, profile] of profiles) {
        if (profile) profileMap.set(wallet, profile);
      }
      setPosterProfiles(profileMap);

      if (posterJobs.length > 0) {
        const counts = await Promise.all(
          posterJobs.map(async (j) => {
            const apps = await getApplicationsForJob(j.entityKey);
            return [j.entityKey, apps.length] as const;
          })
        );
        setMyJobApplicationCounts(new Map(counts));
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
      toast({ title: 'Failed to load jobs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [walletAddress, toast]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleApply = async (job: Job) => {
    if (!authenticated) { login(); return; }
    if (!walletClient || !walletAddress) return;
    setApplyingTo(job.entityKey);
    try {
      await applyToJob(walletClient, job.entityKey, walletAddress);
      setAppliedJobKeys((prev) => { const next = new Set(prev); next.add(job.entityKey); return next; });
      toast({ title: 'Interest expressed!' });
    } catch (err) {
      console.error('Failed to apply:', err);
      toast({ title: 'Failed to express interest', variant: 'destructive' });
    } finally {
      setApplyingTo(null);
    }
  };

  const normalizedFilter = filter.toLowerCase().trim();
  const filteredJobs = jobs.filter((j) => {
    if (remoteOnly && !j.isRemote) return false;
    if (!normalizedFilter) return true;
    return (
      j.title.toLowerCase().includes(normalizedFilter) ||
      j.company.toLowerCase().includes(normalizedFilter) ||
      j.description.toLowerCase().includes(normalizedFilter) ||
      j.tags.some((t) => t.toLowerCase().includes(normalizedFilter))
    );
  });

  const renderJobCard = (job: Job, isMyJobsTab: boolean) => {
    const poster = posterProfiles.get(job.postedBy);
    const hasApplied = appliedJobKeys.has(job.entityKey);
    const isOwnJob = walletAddress?.toLowerCase() === job.postedBy;
    const appCount = myJobApplicationCounts.get(job.entityKey) ?? 0;

    return (
      <Card
        key={job.entityKey}
        className="bg-[#2A2A2E] border-[#333] hover:border-[#FE7445]/30 transition-colors cursor-pointer"
        onClick={() => router.push(`/jobs/${job.entityKey}`)}
      >
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <Avatar className="w-10 h-10 shrink-0 mt-0.5">
              <AvatarFallback className="bg-[#333] text-[#A0A0A0] font-bold text-xs">
                {(poster?.displayName || job.company || 'J').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium normal-case">{job.title}</p>
              <p className="text-xs text-[#A0A0A0] normal-case mt-0.5">
                {job.company}
                {!isMyJobsTab && poster && (
                  <span className="text-[#666]">
                    {' '}
                    &middot; posted by{' '}
                    <span
                      className="hover:text-[#FE7445] cursor-pointer transition-colors"
                      onClick={(e) => { e.stopPropagation(); router.push(`/profile/${job.postedBy}`); }}
                    >
                      {poster.displayName || poster.username}
                    </span>
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                {job.location && (
                  <span className="flex items-center gap-1 text-[10px] text-[#666]">
                    <MapPin className="w-3 h-3" />
                    {job.location}
                  </span>
                )}
                {job.isRemote && (
                  <Badge
                    variant="outline"
                    className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider px-1.5 py-0"
                  >
                    <Wifi className="w-3 h-3 mr-1" />
                    Remote
                  </Badge>
                )}
                {(job.salary || job.salaryData) && (
                  <span className="flex items-center gap-1 text-[10px] text-[#666]">
                    <DollarSign className="w-3 h-3" />
                    {job.salaryData
                      ? formatSalaryRange(job.salaryData.rangeMin, job.salaryData.rangeMax, job.salaryData.currency)
                      : job.salary}
                    {job.salaryData?.zkProof && (
                      <span title="ZK Verified range"><Shield className="w-3 h-3 text-green-400/60" /></span>
                    )}
                    {job.salaryData && !job.salaryData.zkProof && (
                      <span title="Unverified range"><ShieldAlert className="w-3 h-3 text-yellow-500/60" /></span>
                    )}
                  </span>
                )}
                {job.applyUrl && (
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[#FE7445] hover:text-[#e5673d] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Apply
                  </a>
                )}
                {isMyJobsTab && appCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-[#666]">
                    <Users className="w-3 h-3" />
                    {appCount} interested
                  </span>
                )}
                {job.status === 'filled' && (
                  <Badge variant="outline" className="border-yellow-500/30 text-yellow-500 text-[10px] uppercase tracking-wider px-1.5 py-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Filled
                  </Badge>
                )}
              </div>
              {job.description && (
                <p className="text-xs text-[#888] mt-2 normal-case line-clamp-2">
                  {job.description}
                </p>
              )}
              {job.tags && job.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {job.tags.map((tag) => (
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
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {isMyJobsTab ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#444] text-[#A0A0A0] text-[10px] uppercase tracking-wider"
                  onClick={() => router.push(`/jobs/${job.entityKey}/edit`)}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              ) : isOwnJob ? (
                <Badge
                  variant="outline"
                  className="border-[#444] text-[#666] text-[10px] uppercase tracking-wider"
                >
                  Your Job
                </Badge>
              ) : hasApplied ? (
                <Badge
                  variant="outline"
                  className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Interested
                </Badge>
              ) : (
                <Button
                  size="sm"
                  className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-[10px] tracking-wider"
                  disabled={applyingTo === job.entityKey}
                  onClick={() => handleApply(job)}
                >
                  {applyingTo === job.entityKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : !authenticated ? (
                    <LogIn className="w-3.5 h-3.5 mr-1" />
                  ) : (
                    <Briefcase className="w-3.5 h-3.5 mr-1" />
                  )}
                  INTERESTED
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">[ JOB BOARD ]</h1>
          <p className="text-[#A0A0A0] text-xs mt-1 normal-case">
            On-chain job listings from the trust network
          </p>
        </div>
        <Button
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider"
          onClick={() => { if (!authenticated) { login(); return; } router.push('/jobs/post'); }}
        >
          <Plus className="w-4 h-4 mr-2" />
          POST A JOB
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
          <Input
            className="pl-10 bg-[#2A2A2E] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
            placeholder="FILTER BY TITLE, COMPANY, DESCRIPTION, OR TAG..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={`border-[#333] text-xs font-bold tracking-wider shrink-0 ${
            remoteOnly
              ? 'bg-[#FE7445]/10 border-[#FE7445]/30 text-[#FE7445]'
              : 'text-[#A0A0A0] hover:text-white'
          }`}
          onClick={() => setRemoteOnly((prev) => !prev)}
        >
          <Wifi className="w-3.5 h-3.5 mr-1.5" />
          REMOTE
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#FE7445] mx-auto mb-2" />
          <p className="text-xs text-[#666] uppercase tracking-wider">Loading jobs from Arkiv...</p>
        </div>
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-[#2A2A2E] border border-[#333]">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-[#333] data-[state=active]:text-white text-xs font-bold tracking-wider"
            >
              ALL JOBS
              <Badge variant="secondary" className="ml-2 bg-[#333] text-[#A0A0A0] text-[10px]">
                {filteredJobs.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="mine"
              className="data-[state=active]:bg-[#333] data-[state=active]:text-white text-xs font-bold tracking-wider"
            >
              MY JOBS
              <Badge variant="secondary" className="ml-2 bg-[#333] text-[#A0A0A0] text-[10px]">
                {myJobs.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-[#2A2A2E] border border-[#333] flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-[#444]" />
                </div>
                <p className="text-[#A0A0A0] text-sm normal-case">
                  {filter ? 'No jobs match your filter' : 'No jobs posted yet'}
                </p>
                <p className="text-xs text-[#666] mt-1 normal-case">
                  {filter ? 'Try a different search term' : 'Be the first to post a job on the network'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-[#666] uppercase tracking-wider">
                  {filteredJobs.length} job{filteredJobs.length !== 1 && 's'}
                </p>
                {filteredJobs.map((job) => renderJobCard(job, false))}
              </>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-4 space-y-3">
            {myJobs.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-[#2A2A2E] border border-[#333] flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-[#444]" />
                </div>
                <p className="text-[#A0A0A0] text-sm normal-case">You haven&apos;t posted any jobs yet</p>
                <p className="text-xs text-[#666] mt-1 normal-case">
                  Post your first job to start hiring from the trust network
                </p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-[#666] uppercase tracking-wider">
                  {myJobs.length} listing{myJobs.length !== 1 && 's'}
                </p>
                {myJobs.map((job) => renderJobCard(job, true))}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
