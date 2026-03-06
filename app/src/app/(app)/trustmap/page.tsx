'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import dynamic from 'next/dynamic';
import {
  useAppStore,
  type GraphNode,
  type PersonGraphNode,
  type CompanyGraphNode,
  type JobGraphNode,
  type GraphLink,
} from '@/lib/store';
import { useArkiv } from '@/hooks/use-arkiv';
import { applyToJob, getApplicationsByApplicant } from '@/lib/arkiv';
import { formatSalaryRange } from '@/lib/zk';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  Link,
  Network,
  X,
  Loader2,
  Building2,
  Briefcase,
  MapPin,
  Wifi,
  DollarSign,
  Shield,
  ShieldAlert,
  ExternalLink,
  Check,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#141414]">
      <Loader2 className="w-6 h-6 animate-spin text-[#FE7445]" />
    </div>
  ),
});

// Extend GraphNode with force-graph position fields
type PositionedNode = GraphNode & { x?: number; y?: number };

// --- Colors ---

const COLORS = {
  person: '#FE7445',
  personOther: '#2A2A2E',
  company: '#0EA5E9',
  companyStroke: '#0284C7',
  jobActive: '#F59E0B',
  jobActiveStroke: '#D97706',
  jobFilled: '#78716C',
  jobFilledStroke: '#57534E',
  bg: '#141414',
  stroke: '#444',
  textMuted: '#A0A0A0',
  textSubtle: '#666',
} as const;

// --- Canvas Paint Helpers ---

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
}

export default function TrustMapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [appliedJobKeys, setAppliedJobKeys] = useState<Set<string>>(new Set());
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { authenticated, login } = usePrivy();
  const { walletClient } = useArkiv();

  const walletAddress = useAppStore((s) => s.walletAddress);
  const profile = useAppStore((s) => s.profile);
  const graphData = useAppStore((s) => s.graphData);
  const graphLoading = useAppStore((s) => s.graphLoading);
  const buildGraphData = useAppStore((s) => s.buildGraphData);
  const nodeFilters = useAppStore((s) => s.nodeFilters);
  const setNodeFilter = useAppStore((s) => s.setNodeFilter);

  // Ref for appliedJobKeys to avoid recreating paintNode on every apply
  const appliedJobKeysRef = useRef(appliedJobKeys);
  appliedJobKeysRef.current = appliedJobKeys;

  // Load graph data and user's applications
  useEffect(() => {
    buildGraphData().catch((err) => {
      console.error('Failed to load graph data:', err);
    });
  }, [buildGraphData]);

  useEffect(() => {
    if (!walletAddress) return;
    getApplicationsByApplicant(walletAddress).then((apps) => {
      setAppliedJobKeys(new Set(apps.map((a) => a.jobEntityKey)));
    }).catch((err) => { console.error('Failed to load applications:', err); });
  }, [walletAddress]);

  // Fallback: show self node if no data
  const effectiveGraphData = graphData.nodes.length === 0 && profile && walletAddress
    ? {
        nodes: [{
          nodeType: 'person' as const,
          id: walletAddress,
          wallet: walletAddress,
          displayName: profile.displayName || walletAddress,
          position: profile.position,
          company: profile.company,
          tags: profile.tags,
          avatarUrl: profile.avatarUrl,
          connectionCount: 0,
        }],
        links: [] as GraphLink[],
      }
    : graphData;

  // Stats (memoized to avoid O(n) filters on every render)
  const { personCount, companyCount, jobCount, edgeCount } = useMemo(() => {
    let people = 0, companies = 0, jobs = 0;
    for (const n of effectiveGraphData.nodes) {
      if (n.nodeType === 'person') people++;
      else if (n.nodeType === 'company') companies++;
      else if (n.nodeType === 'job') jobs++;
    }
    return { personCount: people, companyCount: companies, jobCount: jobs, edgeCount: effectiveGraphData.links.length };
  }, [effectiveGraphData]);

  // Resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // --- Node Canvas Paint ---
  const paintNode = useCallback(
    (node: PositionedNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      if (node.nodeType === 'person') {
        const isMe = node.id === walletAddress;
        const radius = isMe ? 10 : 5 + Math.min(node.connectionCount, 5);

        if (isMe) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(254, 116, 69, 0.15)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(254, 116, 69, 0.25)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = isMe ? COLORS.person : COLORS.personOther;
        ctx.fill();
        ctx.strokeStyle = isMe ? COLORS.person : COLORS.stroke;
        ctx.lineWidth = isMe ? 2 : 1;
        ctx.stroke();

        ctx.font = `${isMe ? 'bold ' : ''}${isMe ? 8 : 6}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isMe ? '#1A1A1A' : COLORS.textMuted;
        const initials = (node.displayName || node.wallet || 'U').slice(0, 2).toUpperCase();
        ctx.fillText(initials, x, y);

        if (node.displayName) {
          ctx.font = '4px monospace';
          ctx.fillStyle = COLORS.textSubtle;
          ctx.fillText(node.displayName, x, y + radius + 6);
        }
      } else if (node.nodeType === 'company') {
        const halfSize = 8 + Math.min(node.jobCount, 6) * 1.5;
        const cornerRadius = halfSize * 0.3;

        drawRoundedRect(ctx, x - halfSize, y - halfSize, halfSize * 2, halfSize * 2, cornerRadius);
        ctx.fillStyle = COLORS.company;
        ctx.fill();
        ctx.strokeStyle = COLORS.companyStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0C1A2E';
        const initials = (node.name || 'C').slice(0, 2).toUpperCase();
        ctx.fillText(initials, x, y);

        if (node.name) {
          ctx.font = '4px monospace';
          ctx.fillStyle = COLORS.textSubtle;
          ctx.fillText(node.name.slice(0, 20), x, y + halfSize + 6);
        }
      } else if (node.nodeType === 'job') {
        const size = 7;
        const isFilled = node.status === 'filled';
        const isApplied = appliedJobKeysRef.current.has(node.entityKey);

        drawDiamond(ctx, x, y, size);
        ctx.fillStyle = isFilled
          ? COLORS.jobFilled
          : isApplied
            ? 'rgba(254, 116, 69, 0.3)'
            : COLORS.jobActive;
        ctx.fill();
        ctx.strokeStyle = isFilled ? COLORS.jobFilledStroke : COLORS.jobActiveStroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (isApplied) {
          ctx.font = 'bold 6px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = COLORS.person;
          ctx.fillText('✓', x, y);
        }

        ctx.font = '3.5px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COLORS.textSubtle;
        ctx.fillText(node.title.slice(0, 18), x, y + size + 5);
      }
    },
    [walletAddress]
  );

  // --- Link Canvas Paint ---
  const paintLink = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D) => {
      const src = link.source as unknown as PositionedNode;
      const tgt = link.target as unknown as PositionedNode;
      if (!src.x || !tgt.x) return;

      ctx.beginPath();
      if (link.linkType === 'posted-job') {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(254, 116, 69, 0.15)';
      }
      ctx.lineWidth = 1;
      ctx.moveTo(src.x, src.y!);
      ctx.lineTo(tgt.x, tgt.y!);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    []
  );

  // --- Stable callbacks for ForceGraph2D ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const linkMode = useCallback(() => 'replace' as const, []);

  // --- Node Click ---
  const handleNodeClick = useCallback(
    (node: PositionedNode) => {
      setSelectedNode(node);
    },
    []
  );

  // --- Apply to Job ---
  const handleApply = async (node: JobGraphNode) => {
    if (!authenticated) { login(); return; }
    if (!walletClient || !walletAddress) return;
    setApplyingTo(node.entityKey);
    try {
      await applyToJob(walletClient, node.entityKey, walletAddress);
      setAppliedJobKeys((prev) => { const next = new Set(prev); next.add(node.entityKey); return next; });
      toast({ title: 'Interest expressed!' });
    } catch (err) {
      console.error('Failed to apply:', err);
      toast({ title: 'Failed to express interest', variant: 'destructive' });
    } finally {
      setApplyingTo(null);
    }
  };

  const showEmptyState = !graphLoading && effectiveGraphData.nodes.length === 0;

  return (
    <div className="h-screen flex flex-col md:flex-row relative">
      {/* Graph Canvas */}
      <div ref={containerRef} className="flex-1 bg-[#141414] relative">
        {graphLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Loader2 className="w-8 h-8 animate-spin text-[#FE7445] mb-4" />
            <p className="text-[10px] text-[#666] uppercase tracking-wider">Loading trust map...</p>
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Network className="w-12 h-12 text-[#444] mb-4" />
            <p className="text-[#A0A0A0] font-bold text-xs tracking-wider">NO GRAPH DATA YET</p>
            <p className="text-[10px] text-[#666] mt-1 normal-case">
              Create your profile and connect with people to see your trust map come alive
            </p>
          </div>
        ) : (
          <ForceGraph2D
            width={dimensions.width}
            height={dimensions.height}
            graphData={effectiveGraphData}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodeCanvasObject={paintNode as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodePointerAreaPaint={pointerAreaPaint}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onNodeClick={handleNodeClick as any}
            linkCanvasObjectMode={linkMode}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkCanvasObject={paintLink as any}
            backgroundColor="#141414"
            cooldownTicks={100}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Selected Node Detail Panel */}
        {selectedNode && (
          <div className="absolute top-4 left-4 z-10">
            <Card className="bg-[#2A2A2E]/95 border-[#333] backdrop-blur-sm w-72">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">
                    [ {selectedNode.nodeType === 'person'
                      ? (selectedNode.id === walletAddress ? 'YOU' : 'PERSON')
                      : selectedNode.nodeType === 'company'
                        ? 'COMPANY'
                        : 'JOB LISTING'} ]
                  </span>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-[#666] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Person Detail */}
                {selectedNode.nodeType === 'person' && (
                  <PersonDetail
                    node={selectedNode}
                    isCurrentUser={selectedNode.id === walletAddress}
                    onNavigate={() => router.push(`/profile/${selectedNode.wallet}`)}
                  />
                )}

                {/* Company Detail */}
                {selectedNode.nodeType === 'company' && (
                  <CompanyDetail
                    node={selectedNode}
                    onNavigate={() => router.push(`/company/${selectedNode.wallet}`)}
                  />
                )}

                {/* Job Detail */}
                {selectedNode.nodeType === 'job' && (
                  <JobDetail
                    node={selectedNode}
                    hasApplied={appliedJobKeys.has(selectedNode.entityKey)}
                    isApplying={applyingTo === selectedNode.entityKey}
                    isOwnJob={walletAddress?.toLowerCase() === selectedNode.postedBy.toLowerCase()}
                    authenticated={authenticated}
                    onApply={() => handleApply(selectedNode)}
                    onNavigate={() => router.push(`/jobs/${selectedNode.entityKey}`)}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-[#333] bg-[#141414] p-4 space-y-4 shrink-0 overflow-y-auto">
        <div>
          <h2 className="text-base font-bold tracking-wider">[ TRUST MAP ]</h2>
          <p className="text-[10px] text-[#666] normal-case">Your decentralized network graph</p>
        </div>

        {/* Stats */}
        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[#FE7445]" />
                <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">People</span>
              </div>
              <span className="text-sm font-bold">{personCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#0EA5E9]" />
                <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">Companies</span>
              </div>
              <span className="text-sm font-bold">{companyCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">Jobs</span>
              </div>
              <span className="text-sm font-bold">{jobCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5 text-[#181EA9]" />
                <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">Edges</span>
              </div>
              <span className="text-sm font-bold">{edgeCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div>
          <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">Filters</span>
          <div className="mt-2 space-y-1.5">
            <FilterToggle
              label="People"
              color="#FE7445"
              active={nodeFilters.showPeople}
              onToggle={() => setNodeFilter({ showPeople: !nodeFilters.showPeople })}
            />
            <FilterToggle
              label="Companies"
              color="#0EA5E9"
              active={nodeFilters.showCompanies}
              onToggle={() => setNodeFilter({ showCompanies: !nodeFilters.showCompanies })}
            />
            <FilterToggle
              label="Jobs"
              color="#F59E0B"
              active={nodeFilters.showJobs}
              onToggle={() => setNodeFilter({ showJobs: !nodeFilters.showJobs })}
            />
          </div>
        </div>

        {/* Legend */}
        <div className="pt-2">
          <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">Legend</span>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FE7445]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">You</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#2A2A2E] border border-[#444]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">People</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#0EA5E9]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Companies</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rotate-45 bg-[#F59E0B]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Jobs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rotate-45 bg-[#78716C]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Filled</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-px bg-[#FE7445]/30" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Trust Link</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-px border-t border-dashed border-[#F59E0B]/50" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Posted Job</span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-auto">
          <Badge
            variant="outline"
            className="w-full justify-center border-[#FE7445]/20 text-[#FE7445]/60 bg-[#FE7445]/5 text-[10px] py-1.5 uppercase tracking-wider"
          >
            <Network className="w-3 h-3 mr-1.5" />
            Powered by Arkiv
          </Badge>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function FilterToggle({
  label, color, active, onToggle,
}: {
  label: string; color: string; active: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
        active
          ? 'bg-opacity-20 text-white'
          : 'text-[#666] bg-transparent'
      }`}
      style={active ? { backgroundColor: `${color}20`, color } : undefined}
    >
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {label}
    </button>
  );
}

function PersonDetail({
  node, isCurrentUser, onNavigate,
}: {
  node: PersonGraphNode; isCurrentUser: boolean; onNavigate: () => void;
}) {
  return (
    <>
      <p className="font-bold text-sm normal-case">{node.displayName || node.wallet.slice(0, 10)}</p>
      {node.position && (
        <p className="text-[10px] text-[#A0A0A0] mt-0.5 normal-case">
          {node.position}
          {node.company && ` at ${node.company}`}
        </p>
      )}
      {node.connectionCount > 0 && (
        <p className="text-[10px] text-[#666] mt-1 normal-case">
          {node.connectionCount} connection{node.connectionCount !== 1 ? 's' : ''}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full border-[#FE7445]/20 text-[#FE7445] text-[10px] uppercase tracking-wider hover:bg-[#FE7445]/10"
        onClick={onNavigate}
      >
        <ExternalLink className="w-3 h-3 mr-1.5" />
        {isCurrentUser ? 'EDIT PROFILE' : 'VIEW PROFILE'}
      </Button>
    </>
  );
}

function CompanyDetail({
  node, onNavigate,
}: {
  node: CompanyGraphNode; onNavigate: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-[#0EA5E9]" />
        <p className="font-bold text-sm normal-case">{node.name}</p>
      </div>
      {node.description && (
        <p className="text-[10px] text-[#A0A0A0] mt-1 normal-case line-clamp-2">
          {node.description}
        </p>
      )}
      {node.website && (() => {
        try {
          const parsed = new URL(node.website);
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
          return (
            <a
              href={node.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#0EA5E9] hover:underline mt-1 block normal-case"
            >
              {parsed.hostname} ↗
            </a>
          );
        } catch {
          return null;
        }
      })()}
      {node.jobCount > 0 && (
        <p className="text-[10px] text-[#F59E0B] mt-1 normal-case">
          {node.jobCount} active job{node.jobCount !== 1 ? 's' : ''}
        </p>
      )}
      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/30 text-[10px] px-1.5 py-0 uppercase tracking-wider"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full border-[#0EA5E9]/20 text-[#0EA5E9] text-[10px] uppercase tracking-wider hover:bg-[#0EA5E9]/10"
        onClick={onNavigate}
      >
        <ExternalLink className="w-3 h-3 mr-1.5" />
        VIEW COMPANY
      </Button>
    </>
  );
}

function JobDetail({
  node, hasApplied, isApplying, isOwnJob, authenticated, onApply, onNavigate,
}: {
  node: JobGraphNode;
  hasApplied: boolean;
  isApplying: boolean;
  isOwnJob: boolean;
  authenticated: boolean;
  onApply: () => void;
  onNavigate: () => void;
}) {
  return (
    <>
      <p className="font-bold text-sm normal-case">{node.title}</p>
      <p className="text-[10px] text-[#0EA5E9] mt-0.5 normal-case">{node.companyName}</p>

      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {node.location && (
          <span className="flex items-center gap-1 text-[10px] text-[#666]">
            <MapPin className="w-3 h-3" />
            {node.location}
          </span>
        )}
        {node.isRemote && (
          <Badge
            variant="outline"
            className="border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider px-1.5 py-0"
          >
            <Wifi className="w-3 h-3 mr-1" />
            Remote
          </Badge>
        )}
      </div>

      {(node.salary || node.salaryData) && (
        <span className="flex items-center gap-1 text-[10px] text-[#F59E0B] mt-1">
          <DollarSign className="w-3 h-3" />
          {node.salaryData
            ? formatSalaryRange(node.salaryData.rangeMin, node.salaryData.rangeMax, node.salaryData.currency)
            : node.salary}
          {node.salaryData?.zkProof && (
            <span title="ZK Verified range"><Shield className="w-3 h-3 text-green-400/60" /></span>
          )}
          {node.salaryData && !node.salaryData.zkProof && (
            <span title="Unverified range"><ShieldAlert className="w-3 h-3 text-yellow-500/60" /></span>
          )}
        </span>
      )}

      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 text-[10px] px-1.5 py-0 uppercase tracking-wider"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {node.status === 'filled' ? (
        <p className="text-[10px] text-[#78716C] mt-3 uppercase tracking-wider font-bold text-center">
          Position Filled
        </p>
      ) : (
        <div className="flex gap-2 mt-3">
          {isOwnJob ? (
            <Badge
              variant="outline"
              className="flex-1 justify-center border-[#444] text-[#666] text-[10px] uppercase tracking-wider py-1.5"
            >
              Your Job
            </Badge>
          ) : hasApplied ? (
            <Badge
              variant="outline"
              className="flex-1 justify-center border-[#FE7445]/30 text-[#FE7445] text-[10px] uppercase tracking-wider py-1.5"
            >
              <Check className="w-3 h-3 mr-1" />
              Interested
            </Badge>
          ) : (
            <Button
              size="sm"
              className="flex-1 bg-[#FE7445] hover:bg-[#e5673d] text-[#1A1A1A] font-bold text-[10px] tracking-wider"
              disabled={isApplying}
              onClick={(e) => { e.stopPropagation(); onApply(); }}
            >
              {isApplying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : !authenticated ? (
                <LogIn className="w-3.5 h-3.5 mr-1" />
              ) : (
                <Briefcase className="w-3.5 h-3.5 mr-1" />
              )}
              INTERESTED
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-[#333] text-[#A0A0A0] text-[10px] uppercase tracking-wider hover:text-white"
            onClick={onNavigate}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            DETAILS
          </Button>
        </div>
      )}
    </>
  );
}
