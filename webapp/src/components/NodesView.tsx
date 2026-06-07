import { 
  Server, 
  Cpu, 
  Layers, 
  Activity, 
  ShieldCheck, 
  Power, 
  TrendingUp, 
  AlertTriangle, 
  RefreshCw,
  Globe,
  Database
} from 'lucide-react';
import { VMNode } from '../types';
import { motion } from 'motion/react';

interface NodesViewProps {
  nodes: VMNode[];
  onToggleNodeState: (id: string) => void;
}

export default function NodesView({ nodes, onToggleNodeState }: NodesViewProps) {
  return (
    <div className="space-y-6 text-zinc-100" id="nodes-view-container">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Autonomous Computing Nodes</h2>
          <p className="text-xs text-zinc-500">Live compute nodes currently registered in the active computing cluster.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400">
            Active Nodes: <span className="text-emerald-400 font-bold">{nodes.filter(n => n.isAlive).length}</span> / {nodes.length}
          </div>
          <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400">
            Total capacity: <span className="text-blue-400 font-bold">{nodes.reduce((acc, n) => acc + (n.isAlive ? n.cpuCores : 0), 0)} vCPUs</span>
          </div>
        </div>
      </div>

      {/* Grid of Nodes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {nodes.map((node) => {
          const loadColorClass = node.currentLoad > 75 
            ? 'text-rose-400' 
            : node.currentLoad > 40 
              ? 'text-amber-400' 
              : 'text-emerald-400';

          return (
            <motion.div
              layout
              key={node.id}
              className={`rounded-2xl border transition-all ${
                node.isAlive 
                  ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700/80 shadow-md' 
                  : 'bg-zinc-950/20 border-zinc-900/60 opacity-65 grayscale'
              }`}
            >
              {/* Top Banner with status */}
              <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`shrink-0 p-2.5 rounded-xl border ${
                    node.isAlive 
                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40' 
                      : 'bg-rose-950/20 text-rose-400 border-rose-900/40'
                  }`}>
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-bold text-zinc-200 break-all">{node.name}</h3>
                      <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${node.isAlive ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-550 block mt-0.5 truncate select-all">
                      {node.ip}:{node.port}
                    </span>
                  </div>
                </div>

                {/* Power toggle controls */}
                <button
                  onClick={() => onToggleNodeState(node.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    node.isAlive 
                      ? 'bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-400' 
                      : 'bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{node.isAlive ? "Force Crash" : "Recover Node"}</span>
                  <span className="sm:hidden">{node.isAlive ? "Crash" : "Recover"}</span>
                </button>
              </div>

              {/* Node Specifications & Specs */}
              <div className="p-5 space-y-4">
                {/* Visual specifications Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-zinc-950/40 border border-zinc-850/60 rounded-xl">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider mb-1">Region</span>
                    <span className="font-semibold text-zinc-350 flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 text-zinc-500" />
                      {node.region}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 border border-zinc-850/60 rounded-xl">
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider mb-1">Hardware Tier</span>
                    <span className="font-semibold text-zinc-350 font-mono truncate block" title={node.sku}>
                      {node.size.split(' ')[0]}
                    </span>
                  </div>
                </div>

                {/* Live load values */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-sans flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-zinc-500" />
                      Instant Core Loading
                    </span>
                    <span className={`font-mono font-bold ${loadColorClass}`}>
                      {node.currentLoad}%
                    </span>
                  </div>
                  
                  <div className="h-2 rounded-full bg-zinc-950 overflow-hidden relative">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        node.currentLoad > 75 
                          ? 'bg-rose-500' 
                          : node.currentLoad > 40 
                            ? 'bg-amber-500' 
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${node.isAlive ? node.currentLoad : 0}%` }}
                    />
                  </div>

                  {/* Machine-learning upcoming demand curves comparison */}
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-0.5 font-mono">
                    <span>Adaptive filter forecast:</span>
                    <span className="text-zinc-300">
                      {node.isAlive ? `${node.predictedLoad}% CPU` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Completed and failed ledger accounts */}
                <div className="grid grid-cols-3 gap-3 border-t border-zinc-805 pt-4 text-xs font-mono">
                  <div>
                    <span className="text-zinc-550 block text-[9px] uppercase font-bold tracking-wider">Processed</span>
                    <span className="text-sm font-bold text-zinc-300 block mt-0.5">{node.tasksCompleted}</span>
                  </div>
                  <div>
                    <span className="text-zinc-550 block text-[9px] uppercase font-bold tracking-wider">Interrupted</span>
                    <span className="text-sm font-bold text-rose-400 block mt-0.5">{node.tasksFailed}</span>
                  </div>
                  <div>
                    <span className="text-zinc-550 block text-[9px] uppercase font-bold tracking-wider">VM Uptime</span>
                    <span className="text-[11px] font-sans font-medium text-zinc-400 block mt-0.5 truncate">
                      {node.isAlive 
                        ? (node.uptimeSeconds > 3600 
                            ? `${(node.uptimeSeconds / 3600).toFixed(1)} hrs` 
                            : `${Math.round(node.uptimeSeconds / 60)} min`) 
                        : "Offline"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Manual Gossip and state sync explanation */}
      <div className="p-5 border border-amber-950/50 bg-amber-950/10 rounded-2xl flex items-start gap-4">
        <span className="p-2 bg-amber-950/40 border border-amber-900/60 rounded-xl text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wide text-amber-300 font-sans">Decentralized Failover Controller</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Crashing a node triggers immediate reaction in remaining VMs. During active testing, any jobs directed to a crashed node are transparently re-forwarded to healthy worker nodes dynamically, preserving workload integrity.
          </p>
        </div>
      </div>
    </div>
  );
}
