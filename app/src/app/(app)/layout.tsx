'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { ArkivProvider } from '@/providers/arkiv-provider';
import { useArkiv } from '@/hooks/use-arkiv';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { truncateWallet } from '@/lib/utils';
import { KaolinSetupModal } from '@/components/kaolin-setup-modal';
import {
  LayoutDashboard,
  Users,
  Map,
  Search,
  Briefcase,
  Building2,
  Settings,
  LogOut,
  LogIn,
  Menu,
  Loader2,
  HelpCircle,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
  { href: '/connections', label: 'CONNECTIONS', icon: Users },
  { href: '/jobs', label: 'JOBS', icon: Briefcase },
  { href: '/company', label: 'COMPANY', icon: Building2 },
  { href: '/trustmap', label: 'TRUST MAP', icon: Map },
  { href: '/search', label: 'SEARCH', icon: Search },
  { href: '/settings', label: 'SETTINGS', icon: Settings },
];

const PUBLIC_PATHS = ['/jobs', '/company'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function SidebarContent({
  pathname,
  onNavigate,
  identity,
  onLogout,
  onNetworkSetup,
}: {
  pathname: string;
  onNavigate: (href: string) => void;
  identity: string;
  onLogout: () => void;
  onNetworkSetup: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="text-lg font-bold tracking-wider text-[#FE7445]">
          [ ROOTGRAPH ]
        </span>
      </div>

      <div className="h-px bg-[#333]" />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold tracking-wider transition-colors ${
                isActive
                  ? 'bg-[#FE7445]/10 text-[#FE7445] border-l-2 border-[#FE7445]'
                  : 'text-[#A0A0A0] hover:text-white hover:bg-[#2A2A2E]'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="mb-3 rounded-lg bg-[#2A2A2E] px-3 py-2">
          <p className="text-[10px] text-[#666] uppercase tracking-wider font-bold">Connected as</p>
          <p className="truncate text-xs font-mono text-[#A0A0A0]">{identity}</p>
        </div>
        <div className="h-px bg-[#333] mb-3" />
        <Button
          variant="ghost"
          className="w-full justify-start text-[#A0A0A0] hover:text-[#FE7445] hover:bg-[#FE7445]/10 text-xs font-bold tracking-wider"
          onClick={onNetworkSetup}
        >
          <HelpCircle className="w-4 h-4 mr-3" />
          NETWORK SETUP
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-[#A0A0A0] hover:text-red-400 hover:bg-red-500/10 text-xs font-bold tracking-wider"
          onClick={onLogout}
        >
          <LogOut className="w-4 h-4 mr-3" />
          DISCONNECT
        </Button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArkivProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </ArkivProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);

  const { ready, authenticated, logout, login, user } = usePrivy();
  const { isReady } = useArkiv();
  const walletAddress = useAppStore((s) => s.walletAddress);
  const profile = useAppStore((s) => s.profile);
  const profileLoading = useAppStore((s) => s.profileLoading);
  const refreshAll = useAppStore((s) => s.refreshAll);

  const isPublic = isPublicPath(pathname);

  const identity = (() => {
    if (walletAddress) return truncateWallet(walletAddress);
    if (user?.google?.email) return user.google.email;
    return 'Connected';
  })();

  useEffect(() => {
    if (ready && !authenticated && !isPublic) {
      router.replace('/');
    }
  }, [ready, authenticated, router, isPublic]);

  useEffect(() => {
    if (walletAddress && isReady) {
      refreshAll(walletAddress);
    }
  }, [walletAddress, isReady, refreshAll]);

  useEffect(() => {
    if (walletAddress && isReady && !profile && !profileLoading && !isPublic) {
      router.replace('/settings');
    }
  }, [walletAddress, isReady, profile, profileLoading, router, isPublic]);

  if (!ready || !isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1A1A1A]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FE7445]" />
          <p className="text-xs text-[#666] uppercase tracking-wider font-bold">Initializing...</p>
        </div>
      </div>
    );
  }

  // Public pages: show minimal header for unauthenticated users
  if (!authenticated && isPublic) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white">
        <header className="border-b border-[#333] bg-[#141414]">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push('/')}
              className="text-lg font-bold tracking-wider text-[#FE7445]"
            >
              [ ROOTGRAPH ]
            </button>
            <Button
              className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider"
              onClick={login}
            >
              <LogIn className="w-4 h-4 mr-2" />
              CONNECT WALLET
            </Button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  if (!authenticated) return null;

  const handleNavigate = (href: string) => {
    router.push(href);
    setSheetOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-[#333] bg-[#141414] flex-col shrink-0">
        <SidebarContent
          pathname={pathname}
          onNavigate={handleNavigate}
          identity={identity}
          onLogout={handleLogout}
          onNetworkSetup={() => setSetupModalOpen(true)}
        />
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#141414]/95 backdrop-blur-sm border-b border-[#333]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-bold tracking-wider text-[#FE7445]">
            [ ROOTGRAPH ]
          </span>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-[#A0A0A0]" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 p-0 bg-[#141414] border-[#333]"
            >
              <SidebarContent
                pathname={pathname}
                onNavigate={handleNavigate}
                identity={identity}
                onLogout={handleLogout}
                onNetworkSetup={() => { setSheetOpen(false); setSetupModalOpen(true); }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 min-h-screen md:pt-0 pt-14 overflow-y-auto">
        {children}
      </main>

      <KaolinSetupModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
        walletAddress={walletAddress ?? undefined}
      />
    </div>
  );
}
