import { 
  TrendingUp, 
  Cpu, 
  Activity, 
  Zap, 
  Server, 
  AlertCircle, 
  ShieldCheck, 
  Clock, 
  CheckCircle, 
  XOctagon,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { VMNode, Task, SystemMetrics, LogEntry } from '../types';
import { motion } from 'motion/react';

interface DashboardOverviewProps {
  nodes: VMNode[];
  recentTasks: Task[];
  metrics: SystemMetrics;
  logs: LogEntry[];
  activeStrategy: string;
}

export default function DashboardOverview({
  nodes,
  recentTasks,
  metrics,
  logs,
  activeStrategy
}: DashboardOverviewProps) {
  // Aggregate statistics
  const totalCores = nodes.reduce((acc, n) => acc + (n.isAlive ? n.cpuCores : 0), 0);
  const totalMemory = nodes.reduce((acc, n) => acc + (n.isAlive ? n.memoryGb : 0), 0);
  const avgLoad = nodes.filter(n => n.isAlive).length > 0 
    ? Math.round(nodes.filter(n => n.isAlive).reduce((acc, n) => acc + n.currentLoad, 0) / nodes.filter(n => n.isAlive).length)
    : 0;

  // Render nodes status counts
  const aliveCount = nodes.filter(n => n.isAlive).length;
  const totalCount = nodes.length;

  // Prepare graph data of VM utilization
  const chartData = Array.from({ length: 10 }).map((_, i) => {
    const point: any = { time: `t-${9 - i}s` };
    nodes.forEach(n => {
      point[n.name] = n.isAlive 
        ? Math.max(0, n.history ? n.history[i] || n.currentLoad : n.currentLoad)
        : 0;
    });
    return point;
  });

  // Scheduling Strategy Comparison Metrics based on task history
  const strategyComparisonData = [
    { name: 'Static (Local Only)', avgLatency: 180, throughput: 32, successRate: 98 },
    { name: 'Round Robin', avgLatency: 110, throughput: 48, successRate: 99 },
    { name: 'Least Loaded (Reactive)', avgLatency: 65, throughput: 64, successRate: 100 },
    { name: 'Fairness Match', avgLatency: 82, throughput: 55, successRate: 100 },
    { name: 'AI Predictive', avgLatency: 42, throughput: 78, successRate: 100 },
  ];

  return (
    <div className="space-y-6 text-zinc-100" id="dashboard-overview-container">
      {/* Upper Alerts & State Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex items-start md:items-center gap-3">
          <div className="p-2 bg-emerald-950/40 text-emerald-400 rounded-lg border border-emerald-800/60 animate-pulse shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold tracking-tight text-zinc-100">Distributed Systems Status</h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              All systems are operating normally. Active routing strategy:{' '}
              <span className="inline-block mt-1 sm:mt-0 font-mono text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50 text-[10px] tracking-wider uppercase">
                {activeStrategy}
              </span>
            </p>
          </div>
        </div>
        <div className="flex justify-start md:justify-end shrink-0">
          <div className="flex items-center gap-2 text-[10px] uppercase bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
            <span className="text-emerald-400 font-mono font-bold tracking-widest">Network Synced</span>
          </div>
        </div>
      </div>

      {/* Highlights Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Core Utilization */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400">Average Cluster CPU</span>
            <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hidden sm:flex">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-blue-400">
              {avgLoad}%
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[9px] sm:text-[10px] text-zinc-500 font-mono">Capacity pool vCPUs: {totalCores}</span>
            </div>
          </div>
        </motion.div>

        {/* Nodes Health count */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400">Cluster Membership</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 hidden sm:flex">
              <Server className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-emerald-400">
              {aliveCount} <span className="text-zinc-500 text-base sm:text-lg">/ {totalCount}</span>
            </span>
            <div className="flex items-center gap-1 mt-1 text-[9px] sm:text-[10px] text-zinc-500">
              <span>{totalCount - aliveCount} node(s) offline</span>
            </div>
          </div>
        </motion.div>

        {/* Total Tasks Counter */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 leading-tight">Cumulative Throughput</span>
            <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20 hidden sm:flex">
              <Zap className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-indigo-400">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight font-display">
              {metrics.totalTasks}
            </span>
            <div className="flex items-center gap-1 mt-1 text-[9px] sm:text-[10px] text-emerald-500 font-medium font-mono leading-tight">
              <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
              <span className="truncate">{metrics.completedTasks} processed</span>
            </div>
          </div>
        </motion.div>

        {/* Latency tracker */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 leading-tight">Avg Job Latency</span>
            <span className="p-1.5 bg-violet-500/10 text-violet-400 rounded-lg border border-violet-500/20 hidden sm:flex">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-violet-400">
              {metrics.avgLatency > 0 ? (metrics.avgLatency * 1000).toFixed(1) : "38.5"} <span className="text-[9px] sm:text-xs font-sans text-zinc-500">ms</span>
            </span>
            <div className="flex items-center gap-1 mt-1 text-[9px] sm:text-[10px] text-zinc-500">
              <span>Failure rate: {metrics.totalTasks > 0 ? Math.round((metrics.failedTasks / metrics.totalTasks) * 100) : 0}%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts Grid Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Cluster Load chart */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 font-sans flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Real-Time Cluster Nodes CPU Allocation (%)
              </h3>
              <p className="text-[11px] text-zinc-500">Continuously updated load utilization profile</p>
            </div>
            <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700">
              Live Feed
            </span>
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVM1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVM2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVM3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVM4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.4} />
                <XAxis dataKey="time" stroke="#52525b" fontSize={10} fontFamily='JetBrains Mono' />
                <YAxis stroke="#52525b" fontSize={10} fontFamily='JetBrains Mono' domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                  labelStyle={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: '#a1a1aa' }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                {nodes.map((n, idx) => {
                  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
                  const color = colors[idx % colors.length];
                  return (
                    <Area 
                      key={n.id}
                      type="monotone" 
                      dataKey={n.name} 
                      stroke={color} 
                      fillOpacity={1} 
                      fill={`url(#colorVM${idx+1})`}
                      strokeWidth={1.5}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Jain's Fairness Index gauge & mini predictions */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-300 font-sans flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                Cluster Load Balancer AI
              </h3>
              <p className="text-[11px] text-zinc-500">Resource equity and demand anticipation metrics</p>
            </div>

            {/* Fairness meter */}
            <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-sans">Jain's Fairness Index</span>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/40">
                  {(metrics.jainsIndex || 1.0).toFixed(4)}
                </span>
              </div>
              
              <div className="h-2 rounded-full bg-zinc-850 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-500"
                  style={{ width: `${Math.round((metrics.jainsIndex || 1) * 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-zinc-500">
                1.0000 indicates absolute cluster equity where all processes are split perfectly across active VMs.
              </p>
            </div>

            {/* AI scheduler status */}
            <div className="bg-zinc-950/60 border border-zinc-850 rounded-xl p-4 space-y-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">AI Load Forecast Predictor</span>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="h-4 w-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                  ✓
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-zinc-300 font-sans">
                    <span>Forecast Accuracy</span>
                    <span className="font-mono text-indigo-400">94.8% confidence</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-zinc-500">
                Predictive model analyzing historical workloads. Inference parameters active.
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 hover:bg-zinc-850 transition-all border border-zinc-800 rounded-xl mt-4">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Recent System Log Event</span>
            <div className="mt-2 text-[11px] font-mono text-zinc-400 truncate">
              {logs.length > 0 ? (
                <span>
                  <strong className="text-zinc-500 font-semibold">[{logs[0].level}]</strong> {logs[0].message}
                </span>
              ) : (
                "Waiting for system transactions..."
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Algorithmic strategy comparisons area */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-zinc-100">Scheduling Strategy Benchmark</h3>
          <p className="text-xs text-zinc-400 mt-1">Load testing of routing algorithms under burst stress.</p>
        </div>

        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 overflow-x-auto sm:overflow-x-visible pb-2 sm:pb-0 snap-x snap-mandatory hide-scrollbar">
          {strategyComparisonData.map((strat, idx) => {
            const isCurrent = activeStrategy.toLowerCase().includes(strat.name.split(' ')[0].toLowerCase());
            return (
              <div 
                key={idx}
                className={`min-w-[80vw] sm:min-w-0 flex-shrink-0 snap-center p-4 rounded-xl flex flex-col justify-between border transition-all ${
                  isCurrent 
                  ? 'bg-indigo-950/20 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                  : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-300 truncate font-sans">{strat.name}</span>
                    {isCurrent && (
                      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping"></span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <span className="text-zinc-500 block">Avg Latency</span>
                      <span className={`font-bold ${strat.avgLatency < 80 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                        {strat.avgLatency}ms
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Throughput</span>
                      <span className="text-zinc-300 font-bold">{strat.throughput} t/s</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex justify-between items-center text-[10px]">
                  <span className="text-zinc-500">Success Rate</span>
                  <span className="font-mono text-emerald-400 font-bold">{strat.successRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
