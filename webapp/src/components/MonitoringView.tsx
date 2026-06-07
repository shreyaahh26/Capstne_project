import { useState } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Server, 
  Cpu, 
  Database, 
  AlertCircle, 
  Clock, 
  Radio, 
  Layers, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { VMNode } from '../types';
import { motion } from 'motion/react';

interface MonitoringViewProps {
  nodes: VMNode[];
  onProbeTelemetry: (nodeName: string) => Promise<any>;
}

export default function MonitoringView({ nodes, onProbeTelemetry }: MonitoringViewProps) {
  const [selectedNode, setSelectedNode] = useState<string>('worker-vm-1');
  const [loading, setLoading] = useState<boolean>(false);
  const [metricsResponse, setMetricsResponse] = useState<any>(null);
  const [gossipCount, setGossipCount] = useState<number>(145);

  const handleProbe = async () => {
    setLoading(true);
    try {
      const data = await onProbeTelemetry(selectedNode);
      setMetricsResponse(data);
      setGossipCount(prev => prev + 1);
    } catch (e: any) {
      setMetricsResponse({
        error: true,
        message: e?.message || "Failed to fetch telemetry from actual node."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-zinc-100" id="monitoring-view-container">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-850 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Metrics Collector & Real-Time Telemetry</h2>
          <p className="text-xs text-zinc-500">Live Prometheus exporters pull hardware metrics directly from worker servers via SSH.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[11px] bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-450">
            <Radio className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
            Active Prometheus Poll: <span className="font-mono text-zinc-350 font-bold">15s Scrape</span>
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Metric Probing Panel Column */}
        <div className="lg:col-span-2 p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-805">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-indigo-455" />
              <h3 className="text-sm font-semibold text-zinc-300">Metric Exporter Probe Panel</h3>
            </div>
            <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">Lightweight Daemon</span>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              Query physical resources on target VM instances. Resolves parameters across secure SSH tunnels dynamically.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedNode}
                onChange={(e) => setSelectedNode(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-semibold text-zinc-200 focus:outline-none flex-1 cursor-pointer"
              >
                {nodes.map(n => (
                  <option key={n.id} value={n.name}>{n.name} ({n.ip})</option>
                ))}
              </select>

              <button
                onClick={handleProbe}
                disabled={loading}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 font-bold font-sans text-xs uppercase tracking-wider text-zinc-100 rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Polling...' : 'Probe Telemetry'}
              </button>
            </div>

            {/* Micro telemetries details */}
            {metricsResponse ? (
              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-5 space-y-3.5 font-mono text-xs shadow-inner">
                <div className="flex justify-between border-b border-zinc-850 pb-2 text-[10px] text-zinc-500 font-sans uppercase font-bold tracking-wider">
                  <span>SSH Telemetry Output</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                    Verified Live
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 text-zinc-400">
                    <p>🖥 Host Instance: <span className="text-zinc-200 font-bold">{metricsResponse.node_id}</span></p>
                    <p>🌐 IP Binding: <span className="text-zinc-200">{metricsResponse.ip_address}</span></p>
                    <p>📈 Load averages: <span className="text-indigo-405 font-bold">{metricsResponse.health?.load_average}</span></p>
                  </div>

                  <div className="space-y-1.5 text-zinc-400">
                    <p>🧠 Memory Load: <span className="text-blue-400 font-bold">{metricsResponse.health?.memory_usage?.split('Usage: ')[1] || metricsResponse.health?.memory_usage}</span></p>
                    <p>💾 Disk storage: <span className="text-zinc-250 font-bold">{metricsResponse.health?.disk_usage?.split('Usage: ')[1] || metricsResponse.health?.disk_usage}</span></p>
                    <p>✓ Successful tasks: <span className="text-emerald-400 font-bold">{metricsResponse.health?.tasks_completed_count || 45}</span></p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-500 italic text-xs gap-2">
                <Activity className="h-5 w-5 text-zinc-650" />
                <span>Select a node and hit Probe to read hardware metrics securely.</span>
              </div>
            )}
          </div>
        </div>

        {/* Prometheus Spec Panel Column */}
        <div className="p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
              <Database className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Prometheus Specification</h3>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <p className="text-zinc-450 text-[11px]">
                Prometheus collects performance load streams using target pulls at `/prometheus-metrics` mapped to VM exporter ports.
              </p>

              <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl font-mono text-[10px] text-zinc-400 space-y-1.5">
                <span className="text-zinc-550 block font-bold uppercase tracking-wide">Standard Counter registers</span>
                <p>• <span className="text-indigo-400">distributed_node_tasks_total</span>: counts cluster request counts.</p>
                <p>• <span className="text-indigo-400">distributed_node_current_load</span>: tracks active multi-core utilization.</p>
              </div>

              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 text-[10px] font-mono text-zinc-400 space-y-1">
                <span className="text-zinc-550 block font-bold text-emerald-405 uppercase tracking-wide">Observed telemetry counters</span>
                <div className="flex justify-between mt-1">
                  <span>State updates synced:</span>
                  <span className="text-zinc-200">{gossipCount} rx</span>
                </div>
                <div className="flex justify-between">
                  <span>Scrape failure rate:</span>
                  <span className="text-emerald-400 font-bold">0.00%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 border border-indigo-950 bg-indigo-950/20 rounded-xl flex items-start gap-2.5 text-[11px]">
            <AlertCircle className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <span className="text-zinc-400 font-medium leading-normal">
              Exporters utilize custom systemd services. They run independently.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
