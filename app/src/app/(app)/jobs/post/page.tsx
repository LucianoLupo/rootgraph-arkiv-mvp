'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import { useCrypto } from '@/hooks/use-crypto';
import { createJob, getCompanyByWallet, type JobData, type SalaryData } from '@/lib/arkiv';
import { generateSalaryRangeProof, calculateSalaryRange, formatSalaryRange } from '@/lib/zk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Send, Loader2, X, ExternalLink, DollarSign, Shield, Lock } from 'lucide-react';

const JOB_TAGS = [
  'solidity',
  'rust',
  'typescript',
  'python',
  'defi',
  'nft',
  'dao',
  'infrastructure',
  'frontend',
  'backend',
  'fullstack',
  'design',
];

const CURRENCIES = ['USD', 'EUR', 'GBP'];

export default function PostJobPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const { isEncryptionEnabled, encryptSalary } = useCrypto();
  const walletAddress = useAppStore((s) => s.walletAddress);

  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    description: '',
    salary: '',
    applyUrl: '',
    tags: [] as string[],
    isRemote: false,
  });

  const [privateSalary, setPrivateSalary] = useState(false);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [salaryRangeMin, setSalaryRangeMin] = useState(0);
  const [salaryRangeMax, setSalaryRangeMax] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [generatingProof, setGeneratingProof] = useState(false);

  useEffect(() => {
    async function autoFillCompany() {
      if (!walletAddress) return;
      try {
        const company = await getCompanyByWallet(walletAddress);
        if (company) {
          setForm((prev) => ({ ...prev, company: prev.company || company.name }));
        }
      } catch {}
    }
    autoFillCompany();
  }, [walletAddress]);

  useEffect(() => {
    const amount = parseInt(salaryAmount, 10);
    if (!isNaN(amount) && amount > 0) {
      const range = calculateSalaryRange(amount);
      setSalaryRangeMin(range.rangeMin);
      setSalaryRangeMax(range.rangeMax);
    }
  }, [salaryAmount]);

  const updateField = (field: string, value: string | boolean) => {
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

  const handlePost = async () => {
    if (!walletClient || !walletAddress) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }

    setIsPosting(true);
    try {
      let salaryDisplay = form.salary;
      let salaryData: SalaryData | undefined;

      if (privateSalary && salaryAmount) {
        const amount = parseInt(salaryAmount, 10);
        if (isNaN(amount) || amount <= 0) {
          toast({ title: 'Invalid salary amount', variant: 'destructive' });
          setIsPosting(false);
          return;
        }

        if (salaryRangeMin > salaryRangeMax) {
          toast({ title: 'Range min must be less than range max', variant: 'destructive' });
          setIsPosting(false);
          return;
        }

        const encrypted = encryptSalary(amount.toString());
        if (!encrypted) {
          toast({ title: 'Encryption not available. Enable encryption in Settings.', variant: 'destructive' });
          setIsPosting(false);
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
        } catch (err) {
          console.error('Proof generation failed:', err);
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
        postedAt: new Date().toISOString(),
        salaryData,
      };
      await createJob(walletClient, walletAddress, data);
      toast({ title: 'Job posted!' });
      router.push('/jobs');
    } catch (err) {
      console.error('Failed to post job:', err);
      toast({ title: 'Failed to post job', variant: 'destructive' });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => router.push('/jobs')}
          className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-[#FE7445] transition-colors uppercase tracking-wider mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Jobs
        </button>
        <h1 className="text-2xl font-bold">[ POST A JOB ]</h1>
        <p className="text-[#A0A0A0] text-xs mt-1 normal-case">
          Create an on-chain job listing visible to the entire trust network
        </p>
      </div>

      <Card className="bg-[#2A2A2E] border-[#333]">
        <CardHeader>
          <CardTitle className="text-xs tracking-wider">[ JOB DETAILS ]</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Job Title <span className="text-red-400">*</span>
            </Label>
            <Input
              id="title"
              className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
              placeholder="e.g. Senior Solidity Developer"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Company
            </Label>
            <Input
              id="company"
              className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
              placeholder="e.g. Arkiv Network"
              value={form.company}
              onChange={(e) => updateField('company', e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="location" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
                Location
              </Label>
              <Input
                id="location"
                className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
                placeholder="e.g. San Francisco, CA"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
                Remote
              </Label>
              <button
                onClick={() => updateField('isRemote', !form.isRemote)}
                className={`block w-14 h-8 rounded-full transition-colors ${
                  form.isRemote ? 'bg-[#FE7445]' : 'bg-[#333]'
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
              <Label htmlFor="salary" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
                <DollarSign className="w-3 h-3 inline mr-1.5" />
                Salary / Compensation
              </Label>
              {isEncryptionEnabled && (
                <button
                  onClick={() => setPrivateSalary(!privateSalary)}
                  className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase transition-all px-2.5 py-1 rounded-full ${
                    privateSalary
                      ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                      : 'bg-[#333] text-[#A0A0A0] border border-[#444] hover:border-[#666]'
                  }`}
                >
                  {privateSalary ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                  {privateSalary ? 'Private' : 'Make Private'}
                </button>
              )}
            </div>

            {privateSalary ? (
              <div className="space-y-3 bg-[#1A1A1A] rounded-md p-4 border border-green-500/20">
                <p className="text-[10px] text-green-400 normal-case flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Exact salary encrypted. Only you can see it. A range will be shown publicly.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-[#666] uppercase tracking-wider">Exact Amount</Label>
                    <Input
                      type="number"
                      className="bg-[#2A2A2E] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-green-500/30 text-xs"
                      placeholder="e.g. 150000"
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-[10px] text-[#666] uppercase tracking-wider">Currency</Label>
                    <select
                      className="w-full h-10 rounded-md bg-[#2A2A2E] border border-[#333] text-white text-xs px-2 focus:outline-none focus:ring-1 focus:ring-green-500/30"
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
                    <Label className="text-[10px] text-[#666] uppercase tracking-wider">Public Range</Label>
                    <div className="flex gap-3">
                      <Input
                        type="number"
                        className="bg-[#2A2A2E] border-[#333] text-white text-xs"
                        value={salaryRangeMin}
                        onChange={(e) => setSalaryRangeMin(parseInt(e.target.value, 10) || 0)}
                      />
                      <span className="text-[#666] self-center">-</span>
                      <Input
                        type="number"
                        className="bg-[#2A2A2E] border-[#333] text-white text-xs"
                        value={salaryRangeMax}
                        onChange={(e) => setSalaryRangeMax(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <p className="text-[10px] text-[#888] normal-case">
                      Displayed as: <span className="text-white font-medium">{formatSalaryRange(salaryRangeMin, salaryRangeMax, salaryCurrency)}</span>
                    </p>
                    <p className="text-[10px] text-green-400/70 normal-case flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      A ZK proof will verify the exact salary falls within this range
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <Input
                id="salary"
                className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
                placeholder="e.g. $120k-$180k, Competitive, Negotiable"
                value={form.salary}
                onChange={(e) => updateField('salary', e.target.value)}
              />
            )}
          </div>

          <div className="h-px bg-[#333]" />

          <div className="space-y-2">
            <Label htmlFor="description" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Description
            </Label>
            <textarea
              id="description"
              className="w-full rounded-md bg-[#1A1A1A] border border-[#333] text-white placeholder:text-[#666] text-xs p-3 min-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-[#FE7445]/30 font-mono"
              placeholder="Describe the role, responsibilities, and requirements..."
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={2000}
            />
            <p className="text-[10px] text-[#666] text-right">{form.description.length}/2000</p>
          </div>

          <div className="h-px bg-[#333]" />

          <div className="space-y-2">
            <Label htmlFor="applyUrl" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              <ExternalLink className="w-3 h-3 inline mr-1.5" />
              Apply URL
            </Label>
            <Input
              id="applyUrl"
              className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
              placeholder="https://yourcompany.com/careers/apply"
              value={form.applyUrl}
              onChange={(e) => updateField('applyUrl', e.target.value)}
            />
            <p className="text-[10px] text-[#666] normal-case">
              External link where candidates can apply for this position
            </p>
          </div>

          <div className="h-px bg-[#333]" />

          <div className="space-y-3">
            <Label className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">Tags</Label>
            <p className="text-[10px] text-[#666] normal-case">
              Select tags relevant to this position
            </p>
            <div className="flex flex-wrap gap-2">
              {JOB_TAGS.map((tag) => {
                const isSelected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${
                      isSelected
                        ? 'bg-[#FE7445]/15 text-[#FE7445] border border-[#FE7445]/30'
                        : 'bg-[#333] text-[#A0A0A0] border border-[#444] hover:border-[#666]'
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
                    className="bg-[#FE7445]/10 text-[#FE7445] text-[10px] cursor-pointer hover:bg-[#FE7445]/20 uppercase tracking-wider"
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
        <p className="text-[10px] text-[#666] uppercase tracking-wider">
          Stored on Arkiv Network (on-chain)
        </p>
        <Button
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider px-8"
          onClick={handlePost}
          disabled={isPosting || generatingProof || !form.title.trim()}
        >
          {isPosting || generatingProof ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {generatingProof ? 'GENERATING PROOF...' : 'POST JOB'}
        </Button>
      </div>
    </div>
  );
}
