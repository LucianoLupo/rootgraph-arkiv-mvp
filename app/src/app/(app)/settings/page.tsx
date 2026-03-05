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
          {isNewProfile ? '[ CREATE PROFILE ]' : '[ SETTINGS ]'}
        </h1>
        <p className="text-[#A0A0A0] text-xs mt-1 normal-case">
          {isNewProfile
            ? 'Set up your on-chain identity to start building trust'
            : 'Manage your RootGraph profile'}
        </p>
      </div>

      {isNewProfile && (
        <Card className="bg-[#FE7445]/5 border-[#FE7445]/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-[#FE7445] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-[#FE7445] uppercase tracking-wider">
                  Welcome to RootGraph!
                </p>
                <p className="text-[10px] text-[#A0A0A0] mt-1 normal-case">
                  Your profile will be stored on Arkiv Network — you own it
                  completely. Fill in your details to get started.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#2A2A2E] border-[#333]">
        <CardHeader>
          <CardTitle className="text-xs tracking-wider">[ PROFILE INFORMATION ]</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Username {isNewProfile && <span className="text-red-400">*</span>}
            </Label>
            <div className="relative">
              <Input
                id="username"
                className={`bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 pr-10 text-xs ${!isNewProfile ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666] animate-spin" />
              )}
              {isNewProfile && !usernameChecking && usernameAvailable === true && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FE7445]" />
              )}
              {isNewProfile && !usernameChecking && usernameAvailable === false && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
              )}
            </div>
            {isNewProfile && usernameAvailable === false && (
              <p className="text-[10px] text-red-400 normal-case">Username is already taken</p>
            )}
            <p className="text-[10px] text-[#666] normal-case">
              {isNewProfile
                ? 'This will be your unique identifier on the network'
                : 'Username cannot be changed.'}
            </p>
          </div>

          <div className="h-px bg-[#333]" />

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Display Name
            </Label>
            <Input
              id="displayName"
              className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
              placeholder="Your Name"
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label htmlFor="position" className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">
              Position
            </Label>
            <Input
              id="position"
              className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-[#666] focus-visible:ring-[#FE7445]/30 text-xs"
              placeholder="e.g. Engineer, Designer, Founder"
              value={form.position}
              onChange={(e) => updateField('position', e.target.value)}
            />
          </div>

          {/* Company */}
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

          <div className="h-px bg-[#333]" />

          {/* Tags */}
          <div className="space-y-3">
            <Label className="text-[#A0A0A0] text-xs font-bold uppercase tracking-wider">Tags</Label>
            <p className="text-[10px] text-[#666] normal-case">
              Select tags that describe you (visible on your profile)
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map((tag) => {
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

      {/* Encryption Status */}
      {!isNewProfile && (
        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardHeader>
            <CardTitle className="text-xs tracking-wider">[ ENCRYPTION ]</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isEncryptionEnabled ? (
                  <Shield className="w-5 h-5 text-green-400" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-[#666]" />
                )}
                <div>
                  <p className="text-xs font-medium normal-case">
                    {isEncryptionEnabled ? 'Encryption enabled' : 'Encryption disabled'}
                  </p>
                  <p className="text-[10px] text-[#666] normal-case mt-0.5">
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
                  className="border-[#FE7445]/30 text-[#FE7445] hover:bg-[#FE7445]/10 font-bold text-[10px] tracking-wider"
                  onClick={handleEnableEncryption}
                  disabled={enablingEncryption}
                >
                  {enablingEncryption ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Shield className="w-3 h-3 mr-1" />
                  )}
                  ENABLE
                </Button>
              )}
            </div>
            {isEncryptionEnabled && publicKeyBase64 && (
              <div className="bg-[#1A1A1A] rounded-md p-3 border border-[#333]">
                <p className="text-[10px] text-[#666] uppercase tracking-wider font-bold mb-1">
                  Public Key
                </p>
                <p className="text-[10px] text-[#A0A0A0] font-mono break-all">
                  {publicKeyBase64}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[#666] uppercase tracking-wider">
          Saved to Arkiv Network (on-chain)
        </p>
        <Button
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider px-8"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isNewProfile ? 'CREATE PROFILE' : 'SAVE CHANGES'}
        </Button>
      </div>

      {!isNewProfile && walletAddress && (
        <a
          href={`https://explorer.kaolin.hoodi.arkiv.network/address/${walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-[#FE7445] transition-colors w-fit uppercase tracking-wider"
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
