'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import {
  getCompanyByWallet,
  createCompany,
  updateCompany,
  type CompanyData,
} from '@/lib/arkiv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KaolinSetupModal } from '@/components/kaolin-setup-modal';
import { Save, Loader2, Building2, X } from 'lucide-react';
import type { Hex } from '@arkiv-network/sdk';

const COMPANY_TAGS = [
  'defi',
  'nft',
  'dao',
  'infrastructure',
  'gaming',
  'security',
  'tooling',
  'social',
  'payments',
  'analytics',
];

export default function CompanyPage() {
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const walletAddress = useAppStore((s) => s.walletAddress);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [existingKey, setExistingKey] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    tags: [] as string[],
  });

  useEffect(() => {
    async function load() {
      if (!walletAddress) { setLoading(false); return; }
      try {
        const company = await getCompanyByWallet(walletAddress);
        if (company) {
          setExistingKey(company.entityKey);
          setForm({
            name: company.name || '',
            description: company.description || '',
            website: company.website || '',
            tags: company.tags ?? [],
          });
        }
      } catch (err) {
        console.error('Failed to load company:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [walletAddress]);

  const updateField = (field: string, value: string) => {
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

  const handleSave = async () => {
    if (!walletClient || !walletAddress) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    if (!form.name.trim()) {
      toast({ title: 'Company name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const data: CompanyData = {
        name: form.name,
        description: form.description,
        website: form.website,
        logoUrl: '',
        tags: form.tags,
        createdAt: new Date().toISOString(),
      };

      if (existingKey) {
        await updateCompany(walletClient, existingKey as Hex, walletAddress, data);
        toast({ title: 'Company profile updated!' });
      } else {
        await createCompany(walletClient, walletAddress, data);
        toast({ title: 'Company profile created!' });
        const refreshed = await getCompanyByWallet(walletAddress);
        if (refreshed) setExistingKey(refreshed.entityKey);
      }
    } catch (err) {
      console.error('Failed to save company:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('transaction failed') || message.toLowerCase().includes('insufficient funds')) {
        setSetupModalOpen(true);
        toast({ title: 'Transaction failed', description: 'You may need testnet ETH.', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to save company profile', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-foreground" />
      </div>
    );
  }

  const isNew = !existingKey;

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isNew ? 'Create company' : 'Company profile'}
        </h1>
        <p className="text-muted-foreground text-xs mt-1 normal-case">
          {isNew
            ? 'Set up your company profile to enhance your job listings'
            : 'Manage your on-chain company profile'}
        </p>
      </div>

      {isNew && (
        <Card className="bg-primary/5 border-foreground/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Company Profile
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 normal-case">
                  Create a company profile to showcase your organization. It will appear on your job listings automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Company information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-muted-foreground text-sm font-medium">
              Company Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="name"
              className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="e.g. Arkiv Network"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground text-sm font-medium">
              Description
            </Label>
            <textarea
              id="description"
              className="w-full rounded-md bg-background border border-border text-white placeholder:text-muted-foreground text-xs p-3 min-h-[100px] resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              placeholder="Describe your company, mission, and what you do..."
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/1000</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website" className="text-muted-foreground text-sm font-medium">
              Website
            </Label>
            <Input
              id="website"
              className="bg-background border-border text-white placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="https://yourcompany.com"
              value={form.website}
              onChange={(e) => updateField('website', e.target.value)}
            />
          </div>

          <div className="h-px bg-muted" />

          <div className="space-y-3">
            <Label className="text-muted-foreground text-sm font-medium">Tags</Label>
            <p className="text-[10px] text-muted-foreground normal-case">
              Select tags that describe your company
            </p>
            <div className="flex flex-wrap gap-2">
              {COMPANY_TAGS.map((tag) => {
                const isSelected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
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
        <p className="text-sm font-medium text-muted-foreground">
          Saved to Arkiv Network (on-chain)
        </p>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium px-8"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isNew ? 'Create company' : 'Save changes'}
        </Button>
      </div>

      <KaolinSetupModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
        walletAddress={walletAddress ?? undefined}
      />
    </div>
  );
}
