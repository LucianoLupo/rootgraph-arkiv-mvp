'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Wallet,
  ArrowRight,
  Database,
  Globe,
  Briefcase,
} from 'lucide-react';

const features = [
  {
    icon: Briefcase,
    label: 'ON-CHAIN JOB BOARD',
    description:
      'Post and discover jobs stored as Arkiv entities. Listings are transparent and censorship-resistant.',
  },
  {
    icon: Shield,
    label: 'TRUST-BASED HIRING',
    description:
      'Hire from your trust network. Connections are verified by cryptographic proofs.',
  },
  {
    icon: Database,
    label: 'DECENTRALIZED PROFILES',
    description:
      'Your professional identity lives on-chain. You own it completely.',
  },
  {
    icon: Globe,
    label: 'PORTABLE REPUTATION',
    description:
      'Your trust graph is composable. Other apps can read your data from Arkiv.',
  },
];

const steps = [
  { num: '01', title: 'CONNECT WALLET', desc: 'Link your wallet or sign in with Google to create your on-chain professional identity.' },
  { num: '02', title: 'POST & DISCOVER JOBS', desc: 'Browse the on-chain job board or post listings. Express interest directly from your wallet.' },
  { num: '03', title: 'BUILD YOUR TRUST GRAPH', desc: 'Connect with professionals. Your network and reputation are permanent and portable.' },
];

export default function LandingPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      router.push('/dashboard');
    },
  });

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <span className="text-lg font-bold tracking-wider text-[#FE7445]">
          [ ROOTGRAPH ]
        </span>
        <div className="hidden sm:flex items-center gap-8 text-xs font-bold tracking-wider text-[#A0A0A0]">
          <span className="hover:text-white cursor-pointer transition-colors" onClick={() => router.push('/jobs')}>JOB BOARD</span>
        </div>
        <Button
          size="sm"
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider rounded-lg"
          onClick={login}
        >
          CONNECT WALLET
        </Button>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: Hero Text */}
          <div>
            <div className="inline-block mb-6 px-3 py-1 rounded-full bg-[#FE7445]/10 border border-[#FE7445]/30">
              <span className="text-[10px] font-bold tracking-wider text-[#FE7445] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FE7445]" />
                LIVE ON ARKIV TESTNET
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
              THE{' '}
              <span className="text-[#FE7445]">ON-CHAIN</span>{' '}
              JOB BOARD
            </h1>

            <p className="text-base text-[#A0A0A0] max-w-lg mb-10 leading-relaxed font-mono">
              Post jobs, hire from your trust network, and build a portable
              professional reputation — all on the Arkiv Network.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider px-8 py-6 rounded-lg"
                onClick={login}
              >
                <Wallet className="w-4 h-4 mr-2" />
                GET STARTED
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-[#333] text-[#A0A0A0] hover:bg-[#2A2A2E] hover:text-white font-bold text-xs tracking-wider px-8 py-6 rounded-lg"
                onClick={() => router.push('/jobs')}
              >
                <Briefcase className="w-4 h-4 mr-2" />
                BROWSE JOBS
              </Button>
            </div>
          </div>

          {/* Right: Feature List */}
          <div className="space-y-4 lg:pt-12">
            {features.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-4 p-4 rounded-lg bg-[#2A2A2E] border border-[#333] hover:border-[#FE7445]/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#FE7445]/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-[#FE7445]" />
                </div>
                <span className="text-xs font-bold tracking-wider">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Graph Preview */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="rounded-xl border border-[#333] bg-[#2A2A2E] overflow-hidden">
          <div className="aspect-video flex items-center justify-center relative">
            <GraphPreview />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">
                Interactive Trust Map Preview
              </span>
              <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold px-2 py-1 border border-[#444] rounded">
                Live Visualization
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-center">
          [ HOW IT WORKS ]
        </h2>
        <p className="text-[#A0A0A0] text-center max-w-xl mx-auto mb-16 text-sm">
          Three steps to own your professional network on-chain.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <span className="text-5xl font-bold text-[#FE7445] block mb-4">
                {step.num}
              </span>
              <h3 className="text-base font-bold tracking-wider mb-2">{step.title}</h3>
              <p className="text-sm text-[#A0A0A0]">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-center">
          [ TRUST, DECENTRALIZED ]
        </h2>
        <p className="text-[#A0A0A0] text-center max-w-xl mx-auto mb-16 text-sm">
          RootGraph reimagines professional networking with on-chain data
          ownership and verifiable trust connections.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.label}
              className="group p-6 rounded-xl border border-[#333] bg-[#2A2A2E] hover:border-[#FE7445]/30 transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-[#FE7445]/10 flex items-center justify-center mb-4 group-hover:bg-[#FE7445]/20 transition-colors">
                <f.icon className="w-6 h-6 text-[#FE7445]" />
              </div>
              <h3 className="text-xs font-bold tracking-wider mb-2">{f.label}</h3>
              <p className="text-xs text-[#A0A0A0] leading-relaxed normal-case">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Built on Arkiv */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <div className="rounded-xl border border-[#333] bg-[#2A2A2E] p-8 sm:p-12 text-center">
          <span className="text-[10px] font-bold tracking-wider text-[#FE7445] block mb-4">
            [ INFRASTRUCTURE ]
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            BUILT ON{' '}
            <span className="text-[#FE7445]">ARKIV NETWORK</span>
          </h2>
          <p className="text-[#A0A0A0] max-w-xl mx-auto mb-8 leading-relaxed text-sm normal-case">
            Arkiv is a decentralized data layer that makes blockchain data
            composable and accessible. RootGraph stores all profiles and
            connections as Arkiv entities.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A1A1A] border border-[#444] text-[#A0A0A0]">
              <span className="w-2 h-2 rounded-full bg-[#FE7445] animate-pulse" />
              ARKIV TESTNET (KAOLIN)
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A1A1A] border border-[#444] text-[#A0A0A0]">
              <Shield className="w-3.5 h-3.5" />
              ON-CHAIN STORAGE
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A1A1A] border border-[#444] text-[#A0A0A0]">
              <Globe className="w-3.5 h-3.5" />
              DECENTRALIZED
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          READY TO OWN YOUR NETWORK?
        </h2>
        <p className="text-[#A0A0A0] mb-8 max-w-lg mx-auto text-sm normal-case">
          Join the decentralized professional graph. Connect your wallet and
          start building trust on-chain.
        </p>
        <Button
          size="lg"
          className="bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-xs tracking-wider px-8 py-6 rounded-lg"
          onClick={login}
        >
          GET STARTED
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#333] bg-[#1A1A1A] px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-wider text-white">
              [ ROOTGRAPH ]
            </span>
            <span className="text-xs text-white/40">x</span>
            <span className="text-xs text-white/60">Arkiv Network</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>Built for the Arkiv Network Hackathon 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function GraphPreview() {
  const nodes = [
    { x: 50, y: 50, size: 10, label: 'You', primary: true },
    { x: 25, y: 30, size: 7, label: 'A' },
    { x: 75, y: 25, size: 7, label: 'B' },
    { x: 20, y: 65, size: 6, label: 'C' },
    { x: 80, y: 60, size: 6, label: 'D' },
    { x: 40, y: 80, size: 5, label: 'E' },
    { x: 65, y: 78, size: 5, label: 'F' },
    { x: 10, y: 45, size: 4, label: 'G' },
    { x: 90, y: 42, size: 4, label: 'H' },
    { x: 35, y: 15, size: 4, label: 'I' },
  ];

  const edges = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [1, 7], [1, 9], [2, 8], [3, 7], [4, 8], [5, 6],
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full opacity-60"
      style={{ filter: 'drop-shadow(0 0 8px rgba(254, 116, 69, 0.2))' }}
    >
      {edges.map(([from, to], i) => (
        <line
          key={i}
          x1={nodes[from].x}
          y1={nodes[from].y}
          x2={nodes[to].x}
          y2={nodes[to].y}
          stroke="#FE7445"
          strokeWidth="0.3"
          opacity="0.3"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle
            cx={n.x}
            cy={n.y}
            r={n.size / 2}
            fill={n.primary ? '#FE7445' : '#2A2A2E'}
            stroke={n.primary ? '#FE7445' : '#444'}
            strokeWidth={n.primary ? '0.5' : '0.3'}
            opacity={n.primary ? 1 : 0.6}
          />
          {n.primary && (
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size / 2 + 2}
              fill="none"
              stroke="#FE7445"
              strokeWidth="0.2"
              opacity="0.3"
            >
              <animate
                attributeName="r"
                from={String(n.size / 2 + 1)}
                to={String(n.size / 2 + 4)}
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.3"
                to="0"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}
    </svg>
  );
}
