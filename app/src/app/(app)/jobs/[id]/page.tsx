'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useArkiv } from '@/hooks/use-arkiv';
import { useCrypto } from '@/hooks/use-crypto';
import { useAppStore } from '@/lib/store';
import {
  getJobByKey,
  getProfile,
  getCompanyByWallet,
  applyToJob,
  getApplicationsByApplicant,
  getApplicationsForJob,
  flagJob,
  getFlagsForJob,
  hasUserFlaggedJob,
  type Job,
  type Profile,
  type Company,
  type JobApplication,
} from '@/lib/arkiv';
import { verifySalaryRangeProof, formatSalaryRange } from '@/lib/zk';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Wifi,
  ExternalLink,
  Loader2,
  Check,
  Clock,
  Pencil,
  Users,
  LogIn,
  DollarSign,
  Building2,
  Flag,
  Lock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Unlock,
} from 'lucide-react';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { authenticated, login } = usePrivy();
  const { walletClient } = useArkiv();
  const { isEncryptionEnabled, encryptForWallet, decryptMessage, decryptSalary } = useCrypto();
  const walletAddress = useAppStore((s) => s.walletAddress);

  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [poster, setPoster] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasApplied, setHasApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applicationCount, setApplicationCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [hasFlagged, setHasFlagged] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [zkVerified, setZkVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [decryptedSalary, setDecryptedSalary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const jobData = await getJobByKey(jobId);
        if (cancelled) return;
        setJob(jobData);

        if (jobData) {
          const [posterProfile, myApplications, jobApplications, companyProfile, flags, userFlagged] = await Promise.all([
            getProfile(jobData.postedBy),
            walletAddress ? getApplicationsByApplicant(walletAddress) : Promise.resolve([]),
            getApplicationsForJob(jobId),
            getCompanyByWallet(jobData.postedBy),
            getFlagsForJob(jobId),
            walletAddress ? hasUserFlaggedJob(jobId, walletAddress) : Promise.resolve(false),
          ]);
          if (cancelled) return;
          setPoster(posterProfile);
          setHasApplied(myApplications.some((a) => a.jobEntityKey === jobId));
          setApplicationCount(jobApplications.length);
          setApplications(jobApplications);
          setCompany(companyProfile);
          setFlagCount(flags.length);
          setHasFlagged(userFlagged);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load job:', err);
        toast({ title: 'Failed to load job', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [jobId, walletAddress, toast]);

  const isOwnJob = walletAddress?.toLowerCase() === job?.postedBy;

  useEffect(() => {
    if (job?.salaryData && isOwnJob) {
      const result = decryptSalary({
        ciphertext: job.salaryData.encryptedAmount,
        nonce: job.salaryData.encryptedNonce,
      });
      setDecryptedSalary(result);
    }
  }, [job, decryptSalary, isOwnJob, walletAddress]);

  const handleApply = async () => {
    if (!authenticated) { login(); return; }
    if (!walletClient || !walletAddress || !job) return;
    setApplying(true);
    try {
      const context = `${job.entityKey}:${walletAddress.toLowerCase()}`;
      let encryptedMsg = undefined;

      if (isEncryptionEnabled && applicationMessage.trim()) {
        encryptedMsg = await encryptForWallet(applicationMessage, job.postedBy, context) ?? undefined;
      }

      const messageToSend = encryptedMsg ? undefined : (isEncryptionEnabled && applicationMessage.trim() ? undefined : applicationMessage || undefined);
      await applyToJob(walletClient, job.entityKey, walletAddress, messageToSend, encryptedMsg);
      setHasApplied(true);
      setApplicationCount((c) => c + 1);
      toast({ title: 'Interest expressed!' });
    } catch (err) {
      console.error('Failed to apply:', err);
      toast({ title: 'Failed to express interest', variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const handleFlag = async () => {
    if (!authenticated) { login(); return; }
    if (!walletClient || !walletAddress || !job) return;
    setFlagging(true);
    try {
      await flagJob(walletClient, job.entityKey, walletAddress);
      setHasFlagged(true);
      setFlagCount((c) => c + 1);
      toast({ title: 'Job flagged' });
    } catch (err) {
      console.error('Failed to flag job:', err);
      toast({ title: 'Failed to flag job', variant: 'destructive' });
    } finally {
      setFlagging(false);
    }
  };

  const handleVerifyProof = async () => {
    if (!job?.salaryData?.zkProof || !job?.salaryData?.proofPublicInputs) return;
    setVerifying(true);
    try {
      const result = await verifySalaryRangeProof(job.salaryData.zkProof, job.salaryData.proofPublicInputs);
      setZkVerified(result);
      toast({ title: result ? 'Salary range verified!' : 'Verification failed' });
    } catch {
      setZkVerified(false);
      toast({ title: 'Verification failed', variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const decryptApplicationMessage = (app: JobApplication): string | null => {
    if (!app.encryptedMessage || !isEncryptionEnabled) return null;
    const context = `${app.jobEntityKey}:${app.applicantWallet}`;
    return decryptMessage(app.encryptedMessage, app.encryptedMessage.senderPublicKey, context);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#FE7445]" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <button
          onClick={() => router.push('/jobs')}
          className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-[#FE7445] transition-colors uppercase tracking-wider mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Jobs
        </button>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#2A2A2E] border border-[#333] flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-[#444]" />
          </div>
          <p className="text-[#A0A0A0] text-sm normal-case">Job not found</p>
        </div>
      </div>
    );
  }

  const postedDate = new Date(job.postedAt);
  const daysAgo = Math.floor((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24));

  const renderSalaryDisplay = () => {
    if (job.salaryData) {
      const rangeText = formatSalaryRange(job.salaryData.rangeMin, job.salaryData.rangeMax, job.salaryData.currency);
      return (
        <span className="flex items-center gap-1 text-xs text-[#888]">
          <DollarSign className="w-3.5 h-3.5" />
          {isOwnJob && decryptedSalary ? (
            <span>
              <span className="text-green-400">{job.salaryData.currency} {parseInt(decryptedSalary).toLocaleString()}</span>
              <span className="text-[#666] ml-1.5">({rangeText})</span>
            </span>
          ) : (
            rangeText
          )}
          {job.salaryData.zkProof ? (
            zkVerified === true ? (
              <span title="ZK Verified"><ShieldCheck className="w-3.5 h-3.5 text-green-400 ml-1" /></span>
            ) : zkVerified === false ? (
              <span title="Verification failed"><ShieldAlert className="w-3.5 h-3.5 text-red-400 ml-1" /></span>
            ) : (
              <span title="ZK proof available"><Shield className="w-3.5 h-3.5 text-green-400/60 ml-1" /></span>
            )
          ) : (
            <span title="Unverified range"><ShieldAlert className="w-3.5 h-3.5 text-yellow-500/60 ml-1" /></span>
          )}
        </span>
      );
    }
    if (job.salary) {
      return (
        <span className="flex items-center gap-1 text-xs text-[#888]">
          <DollarSign className="w-3.5 h-3.5" />
          {job.salary}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/jobs')}
        className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-[#FE7445] transition-colors uppercase tracking-wider"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to Jobs
      </button>

      <Card className="bg-[#2A2A2E] border-[#333]">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold normal-case">{job.title}</h1>
              <p className="text-sm text-[#A0A0A0] normal-case mt-1">{job.company}</p>
            </div>
            {authenticated && isOwnJob && (
              <Button
                variant="outline"
                size="sm"
                className="border-[#444] text-[#A0A0A0] text-[10px] uppercase tracking-wider shrink-0"
                onClick={() => router.push(`/jobs/${job.entityKey}/edit`)}
              >
                <Pencil className="w-3 h-3 mr-1.5" />
                Edit
              </Button>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {job.location && (
              <span className="flex items-center gap-1 text-xs text-[#888]">
                <MapPin className="w-3.5 h-3.5" />
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
            {renderSalaryDisplay()}
            <span className="flex items-center gap-1 text-[10px] text-[#666]">
              <Clock className="w-3 h-3" />
              {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
            </span>
            {applicationCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[#666]">
                <Users className="w-3 h-3" />
                {applicationCount} interested
              </span>
            )}
            {job.status === 'filled' && (
              <Badge variant="outline" className="border-yellow-500/30 text-yellow-500 text-[10px] uppercase tracking-wider">
                Filled
              </Badge>
            )}
          </div>

          {job.salaryData?.zkProof && zkVerified === null && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-[10px] uppercase tracking-wider"
              onClick={handleVerifyProof}
              disabled={verifying}
            >
              {verifying ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              ) : (
                <ShieldCheck className="w-3 h-3 mr-1.5" />
              )}
              VERIFY SALARY RANGE
            </Button>
          )}

          {job.tags && job.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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

          <div className="h-px bg-[#333]" />

          {job.description && (
            <p className="text-xs text-[#A0A0A0] normal-case whitespace-pre-wrap leading-relaxed">
              {job.description}
            </p>
          )}

          <div className="h-px bg-[#333]" />

          <div className="flex items-center gap-3">
            {job.applyUrl && (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  APPLY NOW
                </Button>
              </a>
            )}
            {isOwnJob ? (
              <Badge
                variant="outline"
                className="border-[#444] text-[#666] text-[10px] uppercase tracking-wider px-3 py-1.5"
              >
                Your Job
              </Badge>
            ) : hasApplied ? (
              <Badge
                variant="outline"
                className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider px-3 py-1.5"
              >
                <Check className="w-3 h-3 mr-1" />
                Interested
              </Badge>
            ) : job.status === 'active' ? (
              <Button
                variant={job.applyUrl ? 'outline' : 'default'}
                className={job.applyUrl
                  ? 'border-[#FE7445]/30 text-[#FE7445] hover:bg-[#FE7445]/10 font-bold text-xs tracking-wider'
                  : 'bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider'
                }
                disabled={applying}
                onClick={handleApply}
              >
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : !authenticated ? (
                  <LogIn className="w-4 h-4 mr-2" />
                ) : (
                  <Briefcase className="w-4 h-4 mr-2" />
                )}
                EXPRESS INTEREST
              </Button>
            ) : null}
            {authenticated && !isOwnJob && (
              <Button
                variant="ghost"
                size="sm"
                className={`text-[10px] uppercase tracking-wider ${
                  hasFlagged
                    ? 'text-red-400'
                    : 'text-[#666] hover:text-red-400'
                }`}
                disabled={hasFlagged || flagging}
                onClick={handleFlag}
              >
                {flagging ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Flag className="w-3 h-3 mr-1" />
                )}
                {hasFlagged ? 'FLAGGED' : 'FLAG'}
              </Button>
            )}
            {isOwnJob && flagCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-400">
                <Flag className="w-3 h-3" />
                {flagCount} flag{flagCount !== 1 && 's'}
              </span>
            )}
          </div>

          {/* Application message input for non-owners */}
          {!isOwnJob && !hasApplied && job.status === 'active' && authenticated && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <textarea
                  className="w-full rounded-md bg-[#1A1A1A] border border-[#333] text-white placeholder:text-[#666] text-xs p-3 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-[#FE7445]/30 font-mono"
                  placeholder="Optional message to the poster..."
                  value={applicationMessage}
                  onChange={(e) => setApplicationMessage(e.target.value)}
                  maxLength={500}
                />
              </div>
              {isEncryptionEnabled && poster?.encryptionPublicKey && (
                <p className="text-[10px] text-green-400/70 normal-case flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Your message will be end-to-end encrypted
                </p>
              )}
              {isEncryptionEnabled && !poster?.encryptionPublicKey && applicationMessage && (
                <p className="text-[10px] text-yellow-500/70 normal-case flex items-center gap-1">
                  <Unlock className="w-3 h-3" />
                  Poster has not enabled encryption. Message will be sent in plaintext.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Applications (visible to poster) */}
      {isOwnJob && applications.length > 0 && (
        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardContent className="py-4">
            <p className="text-[10px] text-[#666] uppercase tracking-wider font-bold mb-3">
              Applications ({applications.length})
            </p>
            <div className="space-y-3">
              {applications.map((app) => {
                const decrypted = decryptApplicationMessage(app);
                const displayMessage = decrypted ?? (app.message === '[encrypted]' ? null : app.message);
                return (
                  <div key={app.entityKey} className="border border-[#333] rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <button
                        className="text-xs text-[#FE7445] hover:underline font-mono"
                        onClick={() => router.push(`/profile/${app.applicantWallet}`)}
                      >
                        {app.applicantWallet.slice(0, 6)}...{app.applicantWallet.slice(-4)}
                      </button>
                      <span className="text-[10px] text-[#666]">
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {displayMessage ? (
                      <div className="flex items-start gap-1.5">
                        {decrypted && (
                          <Lock className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                        )}
                        <p className="text-xs text-[#A0A0A0] normal-case">{displayMessage}</p>
                      </div>
                    ) : app.encryptedMessage ? (
                      <p className="text-xs text-[#666] normal-case flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        Encrypted message
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {poster && (
        <Card
          className="bg-[#2A2A2E] border-[#333] hover:border-[#FE7445]/30 transition-colors cursor-pointer"
          onClick={() => router.push(`/profile/${job.postedBy}`)}
        >
          <CardContent className="py-4">
            <p className="text-[10px] text-[#666] uppercase tracking-wider font-bold mb-3">
              Posted by
            </p>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 shrink-0">
                <AvatarFallback className="bg-[#FE7445]/15 text-[#FE7445] font-bold text-xs">
                  {(poster.displayName || poster.username || 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium normal-case">
                  {poster.displayName || poster.username}
                </p>
                {poster.position && (
                  <p className="text-xs text-[#888] normal-case">
                    {poster.position}
                    {poster.company && <span className="text-[#666]"> at {poster.company}</span>}
                  </p>
                )}
              </div>
            </div>
            {poster.tags && poster.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {poster.tags.map((tag) => (
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
          </CardContent>
        </Card>
      )}

      {company && (
        <Card
          className="bg-[#2A2A2E] border-[#333] hover:border-[#FE7445]/30 transition-colors cursor-pointer"
          onClick={() => router.push(`/company/${job.postedBy}`)}
        >
          <CardContent className="py-4">
            <p className="text-[10px] text-[#666] uppercase tracking-wider font-bold mb-3">
              Company
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FE7445]/15 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-[#FE7445]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium normal-case">{company.name}</p>
                {company.description && (
                  <p className="text-xs text-[#888] normal-case line-clamp-1 mt-0.5">
                    {company.description}
                  </p>
                )}
              </div>
            </div>
            {company.tags && company.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {company.tags.map((tag) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
