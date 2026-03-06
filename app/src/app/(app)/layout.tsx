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
import { ErrorBoundary } from '@/components/error-boundary';
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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/connections', label: 'Connections', icon: Users },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/company', label: 'Company', icon: Building2 },
  { href: '/trustmap', label: 'Trust Map', icon: Map },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/settings', label: 'Settings', icon: Settings },
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
        <span className="text-lg font-bold tracking-wider text-foreground">
          [ ROOTGRAPH ]
        </span>
      </div>

      <div className="h-px bg-border" />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              className={`w-full flex items-center px-4 py-3 gap-3 rounded-lg text-[15px] transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="mb-3 rounded-lg bg-muted px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Connected as</p>
          <p className="truncate text-xs font-mono text-muted-foreground">{identity}</p>
        </div>
        <div className="h-px bg-border mb-3" />
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={onNetworkSetup}
        >
          <HelpCircle className="h-5 w-5 mr-3" />
          Network Setup
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={onLogout}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Logout
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-foreground" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Initializing...</p>
        </div>
      </div>
    );
  }

  // Public pages: show minimal header for unauthenticated users
  if (!authenticated && isPublic) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border/60 bg-background">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push('/')}
              className="text-lg font-bold tracking-wider text-foreground"
            >
              [ ROOTGRAPH ]
            </button>
            <Button
              className="bg-primary text-primary-foreground font-medium text-sm"
              onClick={login}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          </div>
        </header>
        <main><ErrorBoundary>{children}</ErrorBoundary></main>
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
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 flex-col shrink-0">
        <SidebarContent
          pathname={pathname}
          onNavigate={handleNavigate}
          identity={identity}
          onLogout={handleLogout}
          onNetworkSetup={() => setSetupModalOpen(true)}
        />
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-bold tracking-wider text-foreground">
            [ ROOTGRAPH ]
          </span>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 p-0 bg-background border-border"
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
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <KaolinSetupModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
        walletAddress={walletAddress ?? undefined}
      />
    </div>
  );
}
