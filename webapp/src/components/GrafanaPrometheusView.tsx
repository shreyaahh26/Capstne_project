import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Terminal, 
  Cpu, 
  Settings, 
  HelpCircle, 
  RefreshCw, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Play, 
  Pause, 
  Grid, 
  FileCode, 
  ExternalLink,
  Sliders,
  Server,
  Info,
  Clock,
  Zap,
  BarChart2,
  Lock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { VMNode } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GrafanaPrometheusProps {
  nodes: VMNode[];
  onAddLog?: (source: string, level: 'info' | 'warn' | 'error' | 'system', message: string) => void;
}

interface ParsedMetric {
  name: string;
  labels: Record<string, string>;
  value: number;
  type: string;
  help: string;
}

export default function GrafanaPrometheusView({ nodes, onAddLog }: GrafanaPrometheusProps) {
  // Config state
  const [embedMode, setEmbedMode] = useState<'simulation' | 'iframe'>('simulation');
  const [grafanaUrl, setGrafanaUrl] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(5000); // ms
  const [activeTab, setActiveTab] = useState<'grafana' | 'prometheus'>('grafana');
  const [activePanel, setActivePanel] = useState<'all' | 'latency' | 'throughput' | 'nodes'>('all');

  // Scraping states
  const [rawMetrics, setRawMetrics] = useState<string>('');
  const [parsedMetrics, setParsedMetrics] = useState<ParsedMetric[]>([]);
  const [scrapeTime, setScrapeTime] = useState<string>('Never');
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Live metric logs for simulated graphs
  const [simHistory, setSimHistory] = useState<{
    timestamp: string;
    throughput: number;
    latency: number;
    failures: number;
    load1: number;
    load2: number;
    load3: number;
    load4: number;
  }[]>([]);

  const refreshTimerRef = useRef<any>(null);

  // Initialize timeline metrics
  useEffect(() => {
    setSimHistory([]);
  }, []);

  // Prometheus Scraper
  const handleScrapePrometheus = async () => {
    setIsScraping(true);
    setScrapeError(null);
    try {
      const response = await fetch('/api/v1/metrics');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      setRawMetrics(text);
      setScrapeTime(new Date().toLocaleTimeString());
      
      // Parse scrapable lines
      parseMetricsText(text);

      if (onAddLog) {
        onAddLog('PROMETHEUS', 'info', `Scraped Prometheus metrics endpoint successfully. Recieved ${text.length} bytes.`);
      }
    } catch (e: any) {
      setScrapeError(e.message || 'Error executing pull');
    } finally {
      setIsScraping(false);
    }
  };

  // Extract keys and values from Prometheus exposition standard string text
  const parseMetricsText = (text: string) => {
    const lines = text.split('\n');
    const parsed: ParsedMetric[] = [];
    let currentHelp = '';
    let currentType = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('# HELP ')) {
        const parts = line.split(' ');
        const name = parts[2];
        currentHelp = parts.slice(3).join(' ');
        continue;
      }

      if (line.startsWith('# TYPE ')) {
        const parts = line.split(' ');
        currentType = parts[3];
        continue;
      }

      if (line.startsWith('#')) continue;

      // Match metric lines e.g. distributed_node_current_load{node_id="worker-vm-1"} 12.0
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:{(.*)})?\s+(.+)$/);
      if (match) {
        const name = match[1];
        const labelsStr = match[2] || '';
        const valueVal = parseFloat(match[3]);

        // Break up comma delimited labels
        const labels: Record<string, string> = {};
        if (labelsStr) {
          const labelParts = labelsStr.split(',');
          labelParts.forEach(part => {
            const [k, v] = part.split('=');
            if (k && v) {
              labels[k.trim()] = v.replace(/"/g, '').trim();
            }
          });
        }

        parsed.push({
          name,
          labels,
          value: isNaN(valueVal) ? 0 : valueVal,
          type: currentType || 'gauge',
          help: currentHelp || 'No description available.'
        });
      }
    }

    setParsedMetrics(parsed);

    // Update real-time history for Grafana dashboard graphs
    let throughput = 0;
    let latency = 0;
    let failures = 0;
    let load1 = 0, load2 = 0, load3 = 0, load4 = 0;
    
    parsed.forEach(p => {
      if (p.name === 'distributed_cluster_throughput_tps') throughput = p.value;
      if (p.name === 'distributed_cluster_avg_latency_s') latency = p.value;
      if (p.name === 'distributed_node_tasks_total' && p.labels.status === 'failed') failures += p.value;
      
      if (p.name === 'distributed_node_current_load') {
        if (p.labels.node_id === 'worker-vm-1') load1 = p.value;
        if (p.labels.node_id === 'worker-vm-2') load2 = p.value;
        if (p.labels.node_id === 'worker-vm-3') load3 = p.value;
        if (p.labels.node_id === 'worker-vm-4') load4 = p.value;
      }
    });

    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    
    setSimHistory(prev => {
      const dataPoint = {
        timestamp,
        throughput,
        latency: latency * 1000, // Make it MS to be visible
        failures,
        load1, load2, load3, load4
      };
      const hist = [...prev, dataPoint];
      // keep last 50 points
      return hist.slice(-50);
    });
  };

  // Mock scraper fallback
  // Real Prometheus interval updates
  useEffect(() => {
    if (isRefreshing) {
      refreshTimerRef.current = setInterval(() => {
        // Run Prometheus scrape
        handleScrapePrometheus();
      }, refreshInterval);
    } else {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isRefreshing, refreshInterval]);

  // Handle auto scraping on mount
  useEffect(() => {
    handleScrapePrometheus();
  }, [nodes]);

  // Generate Grafana dashboard JSON mock configuration
  const handleExportDashboardJson = () => {
    const panelsJson = {
      title: "Distributed Scheduling Control Center",
      uid: "distributed-systems-nodes-telemetry",
      schemaVersion: 36,
      timezone: "utc",
      panels: [
        { id: 1, title: "Queries per Second (Throughput)", type: "timeseries", targets: [{ expr: "rate(distributed_node_tasks_total[1m])" }] },
        { id: 2, title: "Job Network Latencies (ms)", type: "timeseries", targets: [{ expr: "histogram_quantile(0.95, sum(rate(distributed_latency_seconds_bucket[5m])) by (le))" }] },
        { id: 3, title: "Host Instance CPU loads", type: "gauge", targets: [{ expr: "distributed_node_current_load" }] },
        { id: 4, title: "Failure Triggers Log", type: "stat", targets: [{ expr: "sum(distributed_node_tasks_total{status=\"failed\"})" }] }
      ]
    };
    
    const fileData = JSON.stringify(panelsJson, null, 2);
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "distributed_systems_grafana_dashboard.json";
    link.click();
    URL.revokeObjectURL(url);
    if (onAddLog) {
      onAddLog('GRAFANA EXPORTER', 'system', 'Exported official Grafana Dashboard provisioning schema template.');
    }
  };

  return (
    <div className="space-y-6 text-zinc-100" id="grafana-prometheus-container">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-850 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Advanced Observability Mesh</h2>
          <p className="text-xs text-zinc-500 font-sans">
            Scrape core Prometheus metrics, view aggregated telemetry streams, and configure embedded Grafana monitoring wrappers.
          </p>
        </div>
        
        {/* Toggle between Main Sub-views */}
        <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('grafana')}
            className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeTab === 'grafana' 
                ? 'bg-zinc-800 text-indigo-400 border border-zinc-700 shadow'
                : 'text-zinc-450 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Grafana Embeds
          </button>
          <button
            onClick={() => setActiveTab('prometheus')}
            className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeTab === 'prometheus' 
                ? 'bg-zinc-800 text-indigo-400 border border-zinc-700 shadow'
                : 'text-zinc-450 hover:text-zinc-200 border border-transparent'
            }`}
          >
            Prometheus Metrics
          </button>
        </div>
      </div>

      {/* Primary Panels Wrapper */}
      <AnimatePresence mode="wait">
        
        {/* TAB 1: GRAFANA INTERFACE EMBEDS */}
        {activeTab === 'grafana' && (
          <motion.div
            key="grafana-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Setting Configuration Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              <div className="lg:col-span-3 p-5 border border-zinc-c rounded-2xl bg-zinc-900/40 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
                  <Settings className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Grafana Sharing Configuration</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-zinc-400 font-semibold block">Integration Frame Connection Mode</label>
                    <div className="flex bg-zinc-950/60 border border-zinc-800 p-1 rounded-xl">
                      <button
                        onClick={() => setEmbedMode('simulation')}
                        className={`flex-1 py-2 font-sans font-semibold rounded-lg text-center cursor-pointer transition-all ${
                          embedMode === 'simulation' 
                            ? 'bg-indigo-600 font-bold text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-255'
                        }`}
                      >
                        ⚡ Live Sandbox Mock
                      </button>
                      <button
                        onClick={() => setEmbedMode('iframe')}
                        className={`flex-1 py-2 font-sans font-semibold rounded-lg text-center cursor-pointer transition-all ${
                          embedMode === 'iframe' 
                            ? 'bg-indigo-600 font-bold text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-255'
                        }`}
                      >
                        🌐 Real Iframe Embed
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-zinc-400 font-semibold block">Auto-Refresh Query Sweep Interval</label>
                    <select
                      value={refreshInterval}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setRefreshInterval(val);
                        setIsRefreshing(val > 0);
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 font-sans font-semibold text-zinc-300 focus:outline-none"
                    >
                      <option value={0}>Pause Auto-Refresh</option>
                      <option value={2000}>Refresh every 2s</option>
                      <option value={5000}>Refresh every 5s</option>
                      <option value={15000}>Refresh every 15s</option>
                      <option value={30000}>Refresh every 30s</option>
                    </select>
                  </div>

                  {embedMode === 'iframe' && (
                    <div className="space-y-1.5 col-span-2">
                      <div className="flex justify-between items-center">
                        <label className="text-zinc-400 font-semibold">Paste Grafana Panel Share URL</label>
                        <span className="text-[10px] text-zinc-550 italic flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Encrypted Sandbox Iframe
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. http://localhost:3000/d-solo/distributed-systems-nodes/summary?orgId=1&panelId=2&refresh=5s"
                          value={grafanaUrl}
                          onChange={(e) => setGrafanaUrl(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-250 focus:outline-none flex-1 placeholder-zinc-700"
                        />
                        <button
                          onClick={handleExportDashboardJson}
                          className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-bold text-zinc-200 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer hover:text-white transition-all shadow-sm"
                        >
                          <FileCode className="h-4 w-4 text-emerald-400" />
                          Export Prov JSON
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Trigger Status */}
              <div className="p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
                    <Activity className="h-4 w-4 text-emerald-450" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Scraper Core Status</h3>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Auto Scraper:</span>
                      <span className={`font-mono font-bold uppercase tracking-wider ${isRefreshing ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isRefreshing ? '● Enabled' : '○ Paused'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Pull Latency:</span>
                      <span className="font-mono text-indigo-400 font-bold">12ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Last Scraped:</span>
                      <span className="font-mono text-zinc-300">{scrapeTime}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleScrapePrometheus}
                  disabled={isScraping}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs rounded-xl tracking-wider uppercase text-white shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isScraping ? 'animate-spin' : ''}`} />
                  {isScraping ? 'PULLING...' : 'SCRAPE ENDPOINT NOW'}
                </button>
              </div>

            </div>

            {/* Grafana Real-Time Dashboard Container */}
            <div className="border border-zinc-800 bg-zinc-950 p-6 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
              
              {/* Grafana Custom Frame Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-zinc-900 gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1 px-2.5 bg-amber-550/15 border border-amber-600/40 text-amber-500 rounded text-[10px] font-mono font-black uppercase tracking-wider">
                    grafana
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-zinc-200 flex items-center gap-1.5">
                      Dashboard: Distributed Scheduling Fleet Metrics
                      <span className="text-[10px] font-mono font-semibold text-zinc-500 uppercase px-1.5 bg-zinc-900 rounded border border-zinc-800">
                        v1.4
                      </span>
                    </h4>
                    <p className="text-[10px] text-zinc-550">Aggregated PromQL metrics visualizer inside the browser</p>
                  </div>
                </div>

                {/* Simulated time selector controls */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 rounded-md">
                    📅 Last 15 minutes (Local)
                  </span>
                  <span className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-emerald-400 font-semibold rounded-md animate-pulse">
                    🟢 Live Update Pool
                  </span>
                </div>
              </div>

              {/* Embed Content Selector */}
              {embedMode === 'iframe' ? (
                grafanaUrl ? (
                  <div className="h-[450px] w-full bg-zinc-900/30 rounded-2xl overflow-hidden border border-zinc-800 flex flex-col justify-between">
                    <iframe
                      src={grafanaUrl}
                      className="w-full h-full border-0 select-none bg-zinc-950"
                      title="Grafana Panel Iframe Embed"
                      referrerPolicy="no-referrer"
                    />
                    <div className="p-3.5 bg-zinc-950 border-t border-zinc-900 text-xs text-zinc-500 flex items-center gap-2.5 justify-center font-mono">
                      <Info className="h-4 w-4 text-indigo-400" />
                      <span>Loaded iframe source: <code className="text-zinc-400 max-w-sm truncate inline-block align-bottom">{grafanaUrl}</code></span>
                    </div>
                  </div>
                ) : (
                  <div className="py-24 border border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="p-3 bg-zinc-900/60 rounded-full border border-zinc-800 text-zinc-450">
                      <Lock className="h-6 w-6" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h5 className="text-sm font-bold text-zinc-300">Real Grafana Connection Awaiting URL</h5>
                      <p className="text-xs text-zinc-500 leading-normal font-sans">
                        Please paste your Grafana dashboard share URL in the configuration box above. Be sure your Grafana server settings permit iframe sharing by toggling:
                      </p>
                      <code className="block bg-zinc-900 p-2.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-400 text-left font-mono leading-relaxed mt-2 select-all">
                        # in grafana.ini:<br/>
                        [security]<br/>
                        allow_embedding = true
                      </code>
                    </div>
                  </div>
                )
              ) : (
                /* INCREDIBLE MOCKUP GRAFANA PANEL GRID (SIMULATED MODE) */
                <div className="space-y-6">
                  {/* Performance Alerts Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CPU Status Gauge */}
                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-850 space-y-1.5 shadow-sm">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono block">Average Node CPU</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-blue-400 font-display">
                          {nodes.filter(n => n.isAlive).length > 0
                            ? Math.round(nodes.filter(n => n.isAlive).reduce((acc, n) => acc + n.currentLoad, 0) / nodes.filter(n => n.isAlive).length)
                            : 0}%
                        </span>
                        <span className="text-[10px] text-zinc-500 font-sans">utilization</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-950 overflow-hidden mt-2">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${Math.round(nodes.reduce((acc, n) => acc + (n.isAlive ? n.currentLoad : 0), 0) / nodes.length)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Queries per second (throughput) */}
                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-855 space-y-1.5 shadow-sm">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono block">Throughput Rate</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-indigo-400 font-display">
                          {(simHistory[simHistory.length - 1]?.throughput || 0).toFixed(1)}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">reqs / sec</span>
                      </div>
                      <span className="text-[9px] text-emerald-500 flex items-center gap-1 mt-1 font-mono">
                        <CheckCircle2 className="h-3 w-3" /> System Stable
                      </span>
                    </div>

                    {/* Peak latency */}
                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-850 space-y-1.5 shadow-sm">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono block">95th Percentile RT</span>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-extrabold text-violet-400 font-display">
                          {(simHistory[simHistory.length - 1]?.latency || 0).toFixed(0)}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-sans">ms</span>
                      </div>
                      <span className="text-[9px] text-zinc-550 block font-sans">Includes regional ping overheads</span>
                    </div>

                    {/* Failure monitors */}
                    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-850 space-y-1.5 shadow-sm">
                      <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest font-mono block">Active Alert Triggers</span>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-extrabold font-display ${nodes.some(n => !n.isAlive) ? 'text-amber-450' : 'text-emerald-450'}`}>
                          {nodes.filter(n => !n.isAlive).length}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">offline nodes</span>
                      </div>
                      {nodes.some(n => !n.isAlive) ? (
                        <span className="text-[9px] text-amber-400 flex items-center gap-1 font-mono">
                          <AlertTriangle className="h-3 w-3 animate-pulse" /> Cluster Deficit Active
                        </span>
                      ) : (
                        <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="h-3 w-3" /> 100% Core Availability
                        </span>
                      )}
                    </div>
                  </div>

                  {/* High Quality Charts Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* CHART 1: Throughput QPS */}
                    <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl space-y-3">
                      <div>
                        <h5 className="text-xs font-bold text-zinc-300 font-sans flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
                          Rate: Requests per Second (Throughput)
                        </h5>
                        <p className="text-[10px] text-zinc-500">Auto-scaled total requests handled across API layers</p>
                      </div>

                      <div className="h-48 w-full font-mono text-[9px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={simHistory} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                            <defs>
                              <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                            <XAxis dataKey="timestamp" stroke="#52525b" fontSize={8} />
                            <YAxis stroke="#52525b" fontSize={8} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} />
                            <Area type="monotone" dataKey="throughput" stroke="#818cf8" strokeWidth={1.5} fillOpacity={1} fill="url(#colorThroughput)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* CHART 2: Latency timeline */}
                    <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl space-y-3">
                      <div>
                        <h5 className="text-xs font-bold text-zinc-300 font-sans flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-violet-400" />
                          Response Time Distribution (95th Latency, ms)
                        </h5>
                        <p className="text-[10px] text-zinc-500">Evaluates VM compute times combined with virtual network delay</p>
                      </div>

                      <div className="h-48 w-full font-mono text-[9px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={simHistory} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                            <XAxis dataKey="timestamp" stroke="#52525b" fontSize={8} />
                            <YAxis stroke="#52525b" fontSize={8} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} />
                            <Line type="monotone" dataKey="latency" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* CHART 3: RealTime Node Load Allocation */}
                    <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl space-y-3 lg:col-span-2">
                      <div>
                        <h5 className="text-xs font-bold text-zinc-300 font-sans flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-blue-400" />
                          Individual Host Utilization Streams (Current load, %)
                        </h5>
                        <p className="text-[10px] text-zinc-500 font-sans">Plots individual CPU queues retrieved via Prometheus SSH exporter hooks</p>
                      </div>

                      <div className="h-56 w-full font-mono text-[9px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={simHistory} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                            <defs>
                              <linearGradient id="cVM1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                              <linearGradient id="cVM2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                              <linearGradient id="cVM3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                              <linearGradient id="cVM4" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                            <XAxis dataKey="timestamp" stroke="#52525b" fontSize={8} />
                            <YAxis stroke="#52525b" fontSize={8} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} />
                            <Legend iconSize={6} iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                            <Area type="monotone" name="worker-vm-1" dataKey="load1" stroke="#3b82f6" fillOpacity={1} fill="url(#cVM1)" strokeWidth={1} />
                            <Area type="monotone" name="worker-vm-2" dataKey="load2" stroke="#10b981" fillOpacity={1} fill="url(#cVM2)" strokeWidth={1} />
                            <Area type="monotone" name="worker-vm-3" dataKey="load3" stroke="#f59e0b" fillOpacity={1} fill="url(#cVM3)" strokeWidth={1} />
                            <Area type="monotone" name="worker-vm-4" dataKey="load4" stroke="#8b5cf6" fillOpacity={1} fill="url(#cVM4)" strokeWidth={1} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}

        {/* TAB 2: PROMETHEUS METRICS SCRAPER */}
        {activeTab === 'prometheus' && (
          <motion.div
            key="prometheus-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Scraping Panel and parsed gauge indicators */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Scraped Registry metrics list */}
              <div className="p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl flex flex-col justify-between h-[520px]">
                <div className="space-y-4 overflow-hidden flex flex-col h-full">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-805">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-emerald-450" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Parsed Prometheus Registry</h3>
                    </div>
                    <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">
                      Live Keys Exporter
                    </span>
                  </div>

                  <div className="space-y-3.5 overflow-y-auto flex-1 pr-1 scrollbar-thin max-h-[420px] select-none text-xs">
                    {parsedMetrics.length > 0 ? (
                      parsedMetrics.map((met, index) => {
                        const isCounter = met.type === 'counter';
                        return (
                          <div 
                            key={index} 
                            className="p-3.5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-800 rounded-xl flex flex-col gap-2 transition-all"
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div className="space-y-1">
                                <span className="font-mono text-[11px] text-indigo-400 font-extrabold break-all block">
                                  {met.name}
                                </span>
                                <span className="text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-500 font-semibold px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                                  {met.type}
                                </span>
                              </div>

                              <span className="font-mono text-xs font-extrabold text-emerald-400 bg-emerald-950/15 border border-emerald-900/40 px-2 py-1 rounded">
                                {met.value}
                              </span>
                            </div>

                            {/* Labels badge list */}
                            {Object.keys(met.labels).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 items-center mt-1">
                                {Object.entries(met.labels).map(([key, val]) => (
                                  <span 
                                    key={key} 
                                    className="text-[9px] font-mono bg-zinc-900/80 border border-zinc-805/70 text-zinc-450 px-1.5 py-0.5 rounded"
                                  >
                                    {key}: <span className="text-zinc-300">{val}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            <p className="text-[10px] text-zinc-500 leading-normal font-sans pt-1">
                              💡 {met.help}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-24 text-center text-zinc-500 italic">
                        No processed scrape keys. Hit Scrape Metrics to initialize registry.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* stdout logger display raw code */}
              <div className="p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl flex flex-col justify-between h-[520px]">
                <div className="space-y-4 overflow-hidden flex flex-col h-full">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-sans">Raw Prometheus Text Exposition format</h3>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 font-bold uppercase animate-pulse">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                      OK
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                    Prometheus scrapes these custom logs via HTTP GET at <code className="bg-zinc-950 text-zinc-400 px-1.5 py-0.5 rounded font-mono">/prometheus-metrics</code>. Displays type comments alongside metric coordinates.
                  </p>

                  <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-4.5 font-mono text-[10px] text-zinc-455 overflow-y-auto flex-1 select-all scrollbar-thin">
                    <pre className="text-emerald-500 whitespace-pre scroll-smooth leading-normal">
                      {rawMetrics || '# Scrape metrics endpoint is currently idle.'}
                    </pre>
                  </div>
                </div>
              </div>

            </div>

            {/* Instruction Panel */}
            <div className="p-5 border border-zinc-c rounded-2xl bg-indigo-950/20 text-xs flex gap-3 text-zinc-400 leading-relaxed font-sans">
              <Info className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-zinc-200 font-bold font-sans">DevOps Integration Guide: How to connect this cluster to a physical Prometheus Server</span>
                <p>
                  To capture these logs inside your internal Prometheus server, add a target block to your <code className="bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded">prometheus.yml</code> configurations pointing to this instance binding on port 3000:
                </p>
                <code className="block bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-850 text-[10px] text-zinc-450 mt-2 font-mono leading-relaxed select-all">
                  scrape_configs:<br/>
                  &nbsp;&nbsp;- job_name: 'distributed_systems_scheduling_cluster'<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;metrics_path: '/prometheus-metrics'<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;scrape_interval: 10s<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;static_configs:<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- targets: ['localhost:3000']
                </code>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
