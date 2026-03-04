'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAppStore, type GraphNode as StoreGraphNode } from '@/lib/store';

type GraphNode = StoreGraphNode & { x?: number; y?: number };
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Link, Network, X, Loader2 } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#141414]">
      <Loader2 className="w-6 h-6 animate-spin text-[#FE7445]" />
    </div>
  ),
});

interface SelectedNode {
  id: string;
  displayName: string;
  position?: string;
  company?: string;
  isCurrentUser: boolean;
}

export default function TrustMapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const walletAddress = useAppStore((s) => s.walletAddress);
  const profile = useAppStore((s) => s.profile);
  const graphData = useAppStore((s) => s.graphData);
  const buildGraphData = useAppStore((s) => s.buildGraphData);

  useEffect(() => {
    buildGraphData().catch((err) => {
      console.error('Failed to load graph data:', err);
    });
  }, [buildGraphData]);

  const effectiveGraphData = graphData.nodes.length === 0 && profile && walletAddress
    ? {
        nodes: [{
          id: walletAddress,
          wallet: walletAddress,
          displayName: profile.displayName || walletAddress,
          position: profile.position,
          company: profile.company,
          connectionCount: 0,
        }],
        links: [],
      }
    : graphData;

  const totalNodes = effectiveGraphData.nodes.length;
  const directLinks = effectiveGraphData.links.filter(
    (l) => {
      const src = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const tgt = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return src === walletAddress || tgt === walletAddress;
    }
  ).length;

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

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
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
      ctx.fillStyle = isMe ? '#FE7445' : '#2A2A2E';
      ctx.fill();
      ctx.strokeStyle = isMe ? '#FE7445' : '#444';
      ctx.lineWidth = isMe ? 2 : 1;
      ctx.stroke();

      ctx.font = `${isMe ? 'bold ' : ''}${isMe ? 8 : 6}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isMe ? '#1A1A1A' : '#A0A0A0';
      const initials = (node.displayName || node.wallet || 'U').slice(0, 2).toUpperCase();
      ctx.fillText(initials, x, y);

      if (node.displayName) {
        ctx.font = '4px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(node.displayName, x, y + radius + 6);
      }
    },
    [walletAddress]
  );

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode({
        id: node.id,
        displayName: node.displayName || node.wallet,
        position: node.position,
        company: node.company,
        isCurrentUser: node.id === walletAddress,
      });
    },
    [walletAddress]
  );

  const showEmptyState = effectiveGraphData.nodes.length === 0;

  return (
    <div className="h-screen flex flex-col md:flex-row relative">
      {/* Graph Canvas */}
      <div ref={containerRef} className="flex-1 bg-[#141414] relative">
        {showEmptyState ? (
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
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const x = node.x ?? 0;
              const y = node.y ?? 0;
              ctx.beginPath();
              ctx.arc(x, y, 12, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onNodeClick={handleNodeClick as any}
            linkColor={() => 'rgba(254, 116, 69, 0.15)'}
            linkWidth={1}
            backgroundColor="#141414"
            cooldownTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}

        {selectedNode && (
          <div className="absolute top-4 left-4 z-10">
            <Card className="bg-[#2A2A2E]/95 border-[#333] backdrop-blur-sm w-64">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#666] uppercase tracking-wider font-bold">
                    [ {selectedNode.isCurrentUser ? 'YOU' : 'NODE DETAILS'} ]
                  </span>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-[#666] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="font-bold text-sm normal-case">{selectedNode.displayName}</p>
                {selectedNode.position && (
                  <p className="text-[10px] text-[#A0A0A0] mt-0.5 normal-case">
                    {selectedNode.position}
                    {selectedNode.company && ` at ${selectedNode.company}`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Right Sidebar Stats */}
      <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-[#333] bg-[#141414] p-4 space-y-4 shrink-0">
        <div>
          <h2 className="text-base font-bold tracking-wider">[ TRUST MAP ]</h2>
          <p className="text-[10px] text-[#666] normal-case">Your decentralized network graph</p>
        </div>

        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-[#FE7445]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">Nodes</span>
            </div>
            <p className="text-2xl font-bold">{totalNodes}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#2A2A2E] border-[#333]">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Link className="w-4 h-4 text-[#181EA9]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-bold">Edges</span>
            </div>
            <p className="text-2xl font-bold">{directLinks}</p>
          </CardContent>
        </Card>

        <div className="pt-2">
          <div className="flex items-center gap-2 text-[10px] text-[#666] mb-3 uppercase tracking-wider font-bold">
            <span>Legend</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FE7445]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">You</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#2A2A2E] border border-[#444]" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Connections</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-px bg-[#FE7445]/30" />
              <span className="text-[10px] text-[#A0A0A0] uppercase tracking-wider">Trust Link</span>
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
