'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useArkiv } from '@/hooks/use-arkiv';
import { useCrypto } from '@/hooks/use-crypto';
import { useAppStore } from '@/lib/store';
import {
  getJobByKey,
  updateJob,
  type JobData,
  type JobStatus,
  type SalaryData,
} from '@/lib/arkiv';
import { generateSalaryRangeProof, calculateSalaryRange, formatSalaryRange } from '@/lib/zk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, X, ExternalLink, CheckCircle, DollarSign, Shield, Lock } from 'lucide-react';
import type { Hex } from '@arkiv-network/sdk';
import { JOB_TAGS, CURRENCIES } from '@/lib/job-constants';

export default function EditJobPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const { isEncryptionEnabled, encryptSalary, decryptSalary } = useCrypto();
  const walletAddress = useAppStore((s) => s.walletAddress);

  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markingFilled, setMarkingFilled] = useState(false);
  const [generatingProof, setGeneratingProof] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<JobStatus>('active');
  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    description: '',
    salary: '',
    applyUrl: '',
    tags: [] as string[],
    isRemote: false,
    postedAt: '',
  });
  const [existingSalaryData, setExistingSalaryData] = useState<SalaryData | undefined>();
  const [privateSalary, setPrivateSalary] = useState(false);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [salaryRangeMin, setSalaryRangeMin] = useState(0);
  const [salaryRangeMax, setSalaryRangeMax] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const job = await getJobByKey(jobId);
        if (cancelled) return;
        if (!job) {
          toast({ title: 'Job not found', variant: 'destructive' });
          router.push('/jobs');
          return;
        }
        if (walletAddress?.toLowerCase() !== job.postedBy) {
          toast({ title: 'Not authorized to edit this job', variant: 'destructive' });
          router.push('/jobs');
          return;
        }
        setForm({
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          salary: job.salary || '',
          applyUrl: job.applyUrl || '',
          tags: job.tags || [],
          isRemote: job.isRemote,
          postedAt: job.postedAt,
        });
        setCurrentStatus(job.status);

        if (job.salaryData) {
          setExistingSalaryData(job.salaryData);
          setPrivateSalary(true);
          setSalaryCurrency(job.salaryData.currency);
          setSalaryRangeMin(job.salaryData.rangeMin);
          setSalaryRangeMax(job.salaryData.rangeMax);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load job:', err);
        toast({ title: 'Failed to load job', variant: 'destructive' });
        router.push('/jobs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [jobId, walletAddress, router, toast]);

  useEffect(() => {
    if (existingSalaryData && isEncryptionEnabled) {
      const decrypted = decryptSalary({
        ciphertext: existingSalaryData.encryptedAmount,
        nonce: existingSalaryData.encryptedNonce,
      });
      if (decrypted) {
        setSalaryAmount(decrypted);
      }
    }
  }, [existingSalaryData, isEncryptionEnabled, decryptSalary]);

  useEffect(() => {
    if (!existingSalaryData) {
      const amount = parseInt(salaryAmount, 10);
      if (!isNaN(amount) && amount > 0) {
        const range = calculateSalaryRange(amount);
        setSalaryRangeMin(range.rangeMin);
        setSalaryRangeMax(range.rangeMax);
      }
    }
  }, [salaryAmount, existingSalaryData]);

  const updateField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const handleSave = async (status?: JobStatus) => {
    if (!walletClient || !walletAddress) return;
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    const isMarkingFilled = status === 'filled';
    if (isMarkingFilled) setMarkingFilled(true);
    else setSaving(true);

    try {
      let salaryDisplay = form.salary;
      let salaryData: SalaryData | undefined = existingSalaryData;

      if (privateSalary && salaryAmount) {
        const amount = parseInt(salaryAmount, 10);
        if (isNaN(amount) || amount <= 0) {
          toast({ title: 'Invalid salary amount', variant: 'destructive' });
          setSaving(false);
          setMarkingFilled(false);
          return;
        }

        if (salaryRangeMin > salaryRangeMax) {
          toast({ title: 'Range min must be less than range max', variant: 'destructive' });
          setSaving(false);
          setMarkingFilled(false);
          return;
        }

        const encrypted = encryptSalary(amount.toString());
        if (!encrypted) {
          toast({ title: 'Encryption not available. Enable encryption in Settings.', variant: 'destructive' });
          setSaving(false);
          setMarkingFilled(false);
          return;
        }

        salaryDisplay = formatSalaryRange(salaryRangeMin, salaryRangeMax, salaryCurrency);

        setGeneratingProof(true);
        try {
          const { proof, publicInputs } = await generateSalaryRangeProof(amount, salaryRangeMin, salaryRangeMax);
          salaryData = {
            encryptedAmount: encrypted.ciphertext,
            encryptedNonce: encrypted.nonce,
            currency: salaryCurrency,
            rangeMin: salaryRangeMin,
            rangeMax: salaryRangeMax,
            zkProof: proof,
            proofPublicInputs: publicInputs,
          };
        } catch {
          salaryData = {
            encryptedAmount: encrypted.ciphertext,
            encryptedNonce: encrypted.nonce,
            currency: salaryCurrency,
            rangeMin: salaryRangeMin,
            rangeMax: salaryRangeMax,
          };
          toast({ title: 'Posted without ZK proof', description: 'Salary range is shown but not cryptographically verified.' });
        } finally {
          setGeneratingProof(false);
        }
      } else if (!privateSalary) {
        salaryData = undefined;
      }

      const data: JobData = {
        title: form.title,
        company: form.company,
        location: form.location,
        description: form.description,
        salary: salaryDisplay,
        applyUrl: form.applyUrl,
        tags: form.tags,
        isRemote: form.isRemote,
        postedAt: form.postedAt,
        salaryData,
      };
      await updateJob(walletClient, jobId as Hex, walletAddress, data, status ?? currentStatus);
      toast({ title: isMarkingFilled ? 'Job marked as filled!' : 'Job updated!' });
      router.push(`/jobs/${jobId}`);
    } catch (err) {
      console.error('Failed to update job:', err);
      toast({ title: 'Failed to update job', variant: 'destructive' });
    } finally {
      setSaving(false);
      setMarkingFilled(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => router.push(`/jobs/${jobId}`)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Job
        </button>
        <h1 className="text-2xl font-bold">Edit job</h1>
        <p className="text-muted-foreground text-xs mt-1 normal-case">
          Update your on-chain job listing
        </p>
      </div>

      {currentStatus === 'filled' && (
        <Card className="bg-yellow-500/5 border-yellow-500/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              <p className="text-sm font-medium text-yellow-500">
                This job is marked as filled
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Job details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-muted-foreground text-sm font-medium">
              Job Title <span className="text-red-400">*</span>
            </Label>
            <Input
              id="title"
              className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="e.g. Senior Solidity Developer"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company" className="text-muted-foreground text-sm font-medium">
              Company
            </Label>
            <Input
              id="company"
              className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="e.g. Arkiv Network"
              value={form.company}
              onChange={(e) => updateField('company', e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="location" className="text-muted-foreground text-sm font-medium">
                Location
              </Label>
              <Input
                id="location"
                className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
                placeholder="e.g. San Francisco, CA"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm font-medium">
                Remote
              </Label>
              <button
                onClick={() => updateField('isRemote', !form.isRemote)}
                className={`block w-14 h-8 rounded-full transition-colors ${
                  form.isRemote ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`block w-6 h-6 rounded-full bg-white transition-transform mx-1 ${
                    form.isRemote ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="salary" className="text-muted-foreground text-sm font-medium">
                <DollarSign className="w-3 h-3 inline mr-1.5" />
                Salary / Compensation
              </Label>
              {isEncryptionEnabled && (
                <button
                  onClick={() => setPrivateSalary(!privateSalary)}
                  className={`flex items-center gap-1.5 text-sm font-medium  uppercase transition-all px-2.5 py-1 rounded-full ${
                    privateSalary
                      ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                      : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
                  }`}
                >
                  {privateSalary ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                  {privateSalary ? 'Private' : 'Make Private'}
                </button>
              )}
            </div>

            {privateSalary ? (
              <div className="space-y-3 bg-background rounded-md p-4 border border-green-500/20">
                <p className="text-[10px] text-green-400 normal-case flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Exact salary encrypted. Only you can see it.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm font-medium text-muted-foreground">Exact Amount</Label>
                    <Input
                      type="number"
                      className="bg-card border-border text-white placeholder:text-muted-foreground focus-visible:ring-green-500/30 text-xs"
                      placeholder="e.g. 150000"
                      value={salaryAmount}
                      onChange={(e) => {
                        setSalaryAmount(e.target.value);
                        setExistingSalaryData(undefined);
                      }}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-sm font-medium text-muted-foreground">Currency</Label>
                    <select
                      className="w-full h-10 rounded-md bg-card border border-border text-white text-xs px-2 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {salaryAmount && !isNaN(parseInt(salaryAmount, 10)) && parseInt(salaryAmount, 10) > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Public Range</Label>
                    <div className="flex gap-3">
                      <Input
                        type="number"
                        className="bg-card border-border text-white text-xs"
                        value={salaryRangeMin}
                        onChange={(e) => setSalaryRangeMin(parseInt(e.target.value, 10) || 0)}
                      />
                      <span className="text-muted-foreground self-center">-</span>
                      <Input
                        type="number"
                        className="bg-card border-border text-white text-xs"
                        value={salaryRangeMax}
                        onChange={(e) => setSalaryRangeMax(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground normal-case">
                      Displayed as: <span className="text-white font-medium">{formatSalaryRange(salaryRangeMin, salaryRangeMax, salaryCurrency)}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <Input
                id="salary"
                className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
                placeholder="e.g. $120k-$180k, Competitive, Negotiable"
                value={form.salary}
                onChange={(e) => updateField('salary', e.target.value)}
              />
            )}
          </div>

          <div className="h-px bg-muted" />

          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground text-sm font-medium">
              Description
            </Label>
            <textarea
              id="description"
              className="w-full rounded-md bg-background border border-border text-white placeholder:text-muted-foreground text-xs p-3 min-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              placeholder="Describe the role, responsibilities, and requirements..."
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={2000}
            />
            <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/2000</p>
          </div>

          <div className="h-px bg-muted" />

          <div className="space-y-2">
            <Label htmlFor="applyUrl" className="text-muted-foreground text-sm font-medium">
              <ExternalLink className="w-3 h-3 inline mr-1.5" />
              Apply URL
            </Label>
            <Input
              id="applyUrl"
              className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="https://yourcompany.com/careers/apply"
              value={form.applyUrl}
              onChange={(e) => updateField('applyUrl', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground normal-case">
              External link where candidates can apply for this position
            </p>
          </div>

          <div className="h-px bg-muted" />

          <div className="space-y-3">
            <Label className="text-muted-foreground text-sm font-medium">Tags</Label>
            <div className="flex flex-wrap gap-2">
              {JOB_TAGS.map((tag) => {
                const isSelected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium  uppercase transition-all ${
                      isSelected
                        ? 'bg-primary/15 text-foreground border border-foreground/30'
                        : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-foreground text-[10px] cursor-pointer hover:bg-primary/20 "
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentStatus === 'active' && (
            <Button
              variant="outline"
              className="border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 text-sm font-medium "
              onClick={() => handleSave('filled')}
              disabled={markingFilled || saving || generatingProof}
            >
              {markingFilled ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Mark as filled
            </Button>
          )}
          {currentStatus === 'filled' && (
            <Button
              variant="outline"
              className="border-foreground/30 text-foreground hover:bg-primary/10 text-sm font-medium "
              onClick={() => handleSave('active')}
              disabled={markingFilled || saving || generatingProof}
            >
              {markingFilled ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Reactivate
            </Button>
          )}
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium  px-8"
          onClick={() => handleSave()}
          disabled={saving || generatingProof || !form.title.trim()}
        >
          {saving || generatingProof ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {generatingProof ? 'Generating proof...' : 'Update job'}
        </Button>
      </div>
    </div>
  );
}
