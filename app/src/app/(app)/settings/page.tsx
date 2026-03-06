'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import { useCrypto } from '@/hooks/use-crypto';
import {
  createProfile,
  updateProfile,
  getProfileByUsername,
  type ProfileData,
} from '@/lib/arkiv';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KaolinSetupModal } from '@/components/kaolin-setup-modal';
import { Save, Loader2, CheckCircle, X, UserPlus, ExternalLink, Shield, ShieldOff } from 'lucide-react';
import type { Hex } from '@arkiv-network/sdk';

const AVAILABLE_TAGS = [
  'deep',
  'intentional',
  'grounded',
  'builder',
  'creative',
  'analytical',
];

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { walletClient } = useArkiv();
  const { isEncryptionEnabled, publicKeyBase64, promptForSignature, isInitializing } = useCrypto();

  const profile = useAppStore((s) => s.profile);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const fetchProfile = useAppStore((s) => s.fetchProfile);

  const isNewProfile = !profile;

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    position: '',
    company: '',
    tags: [] as string[],
  });

  useEffect(() => {
    if (profile) {
      setForm({
        username: profile.username || '',
        displayName: profile.displayName || '',
        position: profile.position || '',
        company: profile.company || '',
        tags: profile.tags ?? [],
      });
    }
  }, [profile]);

  const [isSaving, setIsSaving] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [enablingEncryption, setEnablingEncryption] = useState(false);

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

  const checkUsername = useCallback(async (username: string) => {
    if (!username.trim() || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setUsernameChecking(true);
    try {
      const existing = await getProfileByUsername(username);
      setUsernameAvailable(!existing);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setUsernameChecking(false);
    }
  }, []);

  const handleEnableEncryption = async () => {
    setEnablingEncryption(true);
    try {
      await promptForSignature();
      toast({ title: 'Encryption enabled!' });
    } catch (err) {
      console.error('Failed to enable encryption:', err);
      toast({ title: 'Failed to enable encryption', variant: 'destructive' });
    } finally {
      setEnablingEncryption(false);
    }
  };

  const handleSave = async () => {
    if (!walletClient || !walletAddress) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    if (isNewProfile && !form.username.trim()) {
      toast({
        title: 'Username required',
        description: 'Please enter a username to continue.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const data: ProfileData = {
        displayName: form.displayName,
        position: form.position,
        company: form.company,
        tags: form.tags,
        avatarUrl: '',
        createdAt: profile?.createdAt || new Date().toISOString(),
        encryptionPublicKey: publicKeyBase64 || profile?.encryptionPublicKey || undefined,
      };

      if (isNewProfile) {
        await createProfile(walletClient, walletAddress, form.username, data);
      } else {
        await updateProfile(
          walletClient,
          profile.entityKey as Hex,
          walletAddress,
          form.username || profile.wallet,
          data
        );
      }

      await fetchProfile(walletAddress);

      toast({
        title: isNewProfile ? 'Profile created!' : 'Profile updated!',
        description: 'Your changes have been saved to Arkiv.',
      });

      if (isNewProfile) {
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('transaction failed') || message.toLowerCase().includes('insufficient funds')) {
        setSetupModalOpen(true);
        toast({
          title: 'Transaction failed',
          description: 'You may need to set up the Kaolin network or get testnet ETH.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Failed to save profile', variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isNewProfile ? 'Create profile' : 'Settings'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1 normal-case">
          {isNewProfile
            ? 'Set up your on-chain identity to start building trust'
            : 'Manage your RootGraph profile'}
        </p>
      </div>

      {isNewProfile && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Welcome to RootGraph!
                </p>
                <p className="text-xs text-muted-foreground mt-1 normal-case">
                  Your profile will be stored on Arkiv Network — you own it
                  completely. Fill in your details to get started.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Profile information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-muted-foreground text-sm font-medium">
              Username {isNewProfile && <span className="text-red-400">*</span>}
            </Label>
            <div className="relative">
              <Input
                id="username"
                className={`bg-input border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring pr-10 text-xs ${!isNewProfile ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder="your.username"
                value={form.username}
                readOnly={!isNewProfile}
                onChange={(e) => {
                  if (isNewProfile) {
                    updateField('username', e.target.value);
                    setUsernameAvailable(null);
                  }
                }}
                onBlur={() => isNewProfile && checkUsername(form.username)}
              />
              {isNewProfile && usernameChecking && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              )}
              {isNewProfile && !usernameChecking && usernameAvailable === true && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
              )}
              {isNewProfile && !usernameChecking && usernameAvailable === false && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
              )}
            </div>
            {isNewProfile && usernameAvailable === false && (
              <p className="text-xs text-red-400 normal-case">Username is already taken</p>
            )}
            <p className="text-xs text-muted-foreground normal-case">
              {isNewProfile
                ? 'This will be your unique identifier on the network'
                : 'Username cannot be changed.'}
            </p>
          </div>

          <div className="h-px bg-border" />

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-muted-foreground text-sm font-medium">
              Display name
            </Label>
            <Input
              id="displayName"
              className="bg-input border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="Your Name"
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label htmlFor="position" className="text-muted-foreground text-sm font-medium">
              Position
            </Label>
            <Input
              id="position"
              className="bg-input border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="e.g. Engineer, Designer, Founder"
              value={form.position}
              onChange={(e) => updateField('position', e.target.value)}
            />
          </div>

          {/* Company */}
          <div className="space-y-2">
            <Label htmlFor="company" className="text-muted-foreground text-sm font-medium">
              Company
            </Label>
            <Input
              id="company"
              className="bg-input border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring text-xs"
              placeholder="e.g. Arkiv Network"
              value={form.company}
              onChange={(e) => updateField('company', e.target.value)}
            />
          </div>

          <div className="h-px bg-border" />

          {/* Tags */}
          <div className="space-y-3">
            <Label className="text-muted-foreground text-sm font-medium">Tags</Label>
            <p className="text-xs text-muted-foreground normal-case">
              Select tags that describe you (visible on your profile)
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map((tag) => {
                const isSelected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-primary/15 text-foreground border border-primary/30'
                        : 'bg-muted text-muted-foreground border border-border hover:border-border/60'
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
                    className="bg-primary/10 text-foreground text-xs cursor-pointer hover:bg-primary/20"
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

      {/* Encryption Status */}
      {!isNewProfile && (
        <Card className="rounded-lg border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Encryption</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isEncryptionEnabled ? (
                  <Shield className="w-5 h-5 text-green-400" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-medium normal-case">
                    {isEncryptionEnabled ? 'Encryption enabled' : 'Encryption disabled'}
                  </p>
                  <p className="text-xs text-muted-foreground normal-case mt-0.5">
                    {isEncryptionEnabled
                      ? 'Your messages and salary data can be encrypted'
                      : 'Sign a message to enable encrypted messaging'}
                  </p>
                </div>
              </div>
              {!isEncryptionEnabled && !isInitializing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-foreground hover:bg-muted text-sm font-medium"
                  onClick={handleEnableEncryption}
                  disabled={enablingEncryption}
                >
                  {enablingEncryption ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Shield className="w-3 h-3 mr-1" />
                  )}
                  Enable
                </Button>
              )}
            </div>
            {isEncryptionEnabled && publicKeyBase64 && (
              <div className="bg-background rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-1">
                  Public key
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {publicKeyBase64}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Saved to Arkiv Network (on-chain)
        </p>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium px-8"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isNewProfile ? 'Create profile' : 'Save changes'}
        </Button>
      </div>

      {!isNewProfile && walletAddress && (
        <a
          href={`https://explorer.kaolin.hoodi.arkiv.network/address/${walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ExternalLink className="w-3 h-3" />
          View on Arkiv Explorer
        </a>
      )}

      <KaolinSetupModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
        walletAddress={walletAddress ?? undefined}
      />
    </div>
  );
}
