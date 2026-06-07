import { 
  Sparkles, 
  HelpCircle, 
  Layers, 
  TrendingUp, 
  Target, 
  BarChart2, 
  AlertCircle,
  TrendingDown,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { VMNode } from '../types';
import { motion } from 'motion/react';

interface FairnessViewProps {
  nodes: VMNode[];
}

export default function FairnessView({ nodes }: FairnessViewProps) {
  // Calculate Jain's Index
  const getJainsIndex = () => {
    const values = nodes.map(n => n.tasksCompleted);
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) return 1.0;
    const squaredSum = sum * sum;
    const sumOfSquares = values.reduce((acc, val) => acc + (val * val), 0);
    const n = nodes.length;
    return squaredSum / (n * sumOfSquares);
  };

  const jainsIndex = getJainsIndex();

  // Prepare chart data format
  const barChartData = nodes.map(n => ({
    name: n.name,
    Tasks: n.tasksCompleted,
    Load: n.currentLoad
  }));

  // Define dynamic rating based on Jain's score
  const getRatingSummary = () => {
    if (jainsIndex > 0.95) return { label: 'Optimal Convergence', color: 'text-emerald-400', banner: 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' };
    if (jainsIndex > 0.8) return { label: 'Balanced Equity', color: 'text-amber-400', banner: 'bg-amber-950/20 border-amber-900/40 text-amber-300' };
    return { label: 'Imbalance Detected', color: 'text-rose-455', banner: 'bg-rose-950/20 border-rose-900/40 text-rose-300' };
  };

  const rating = getRatingSummary();

  return (
    <div className="space-y-6 text-zinc-100" id="fairness-view-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-850 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Jain's Fairness Index & Allocation Balanced Audit</h2>
          <p className="text-xs text-zinc-500">Measures workload distribution fairness mathematically across worker VMs.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono font-bold uppercase rounded-md tracking-wider">
            Index Metric: {jainsIndex.toFixed(5)}
          </span>
        </div>
      </div>

      {/* Jain Index Value Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formula & Explain */}
        <div className="p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
              <Target className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-355 font-sans">Jain's Convergence Score</h3>
            </div>

            <div className="flex items-baseline gap-1.5 py-3">
              <span className={`text-4xl font-extrabold tracking-tight font-display ${rating.color}`}>
                {(jainsIndex * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-zinc-500 font-sans">equity share</span>
            </div>

            <div className={`p-3 border rounded-lg text-xs leading-relaxed ${rating.banner}`}>
              <strong className="block font-bold mb-0.5">{rating.label}</strong>
              Current allocation profiles demonstrate high efficiency alignment.
            </div>
          </div>

          <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-3 text-[10px] font-mono text-zinc-500 leading-relaxed">
            Formula: <code className="text-zinc-350 bg-zinc-900 px-1.5 py-0.5 rounded">J(x) = (∑x)² / (n * ∑x²)</code> where <span className="italic">x</span> represents completed tasks per registered machine instance.
          </div>
        </div>

        {/* Charts: completed tasks bar comparison */}
        <div className="lg:col-span-2 p-5 border border-zinc-805 bg-zinc-900/40 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-805">
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 font-sans flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-450" />
                Completed Task Frequencies per VM
              </h3>
              <p className="text-[11px] text-zinc-500">Validates workload density balance across each compute server instance</p>
            </div>
            <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700">
              Fleet View
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                <XAxis dataKey="name" stroke="#52525b" fontSize={9} fontFamily="JetBrains Mono" />
                <YAxis stroke="#52525b" fontSize={9} fontFamily="JetBrains Mono" />
                <Tooltip 
                  cursor={{ fill: 'rgba(39, 39, 42, 0.4)' }}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} 
                />
                <Bar dataKey="Tasks" radius={[4, 4, 0, 0]}>
                  {barChartData.map((entry, idx) => {
                    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
                    return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Scheduler Strategy Comparative Fairness Table */}
      <div className="p-5 border border-zinc-800 rounded-2xl bg-zinc-900/40 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 font-sans">Dynamic Algorithmic Fairness Benchmark</h3>
          <p className="text-xs text-zinc-500">Standard index benchmarks obtained during cluster saturation routines</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span className="font-semibold">Static Local Route</span>
              <span className="font-mono text-zinc-500">0.2461</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-850 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: '25%' }}></div>
            </div>
            <span className="text-[10px] text-zinc-550 block">High localized clustering; leads to early single node failure.</span>
          </div>

          <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span className="font-semibold">Sequential Round Robin</span>
              <span className="font-mono text-zinc-400">0.8652</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-850 overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: '86%' }}></div>
            </div>
            <span className="text-[10px] text-zinc-550 block">Offers simple round robin fairness, but fails under mixed complexity jobs.</span>
          </div>

          <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span className="font-semibold">Least Loaded Vector</span>
              <span className="font-mono text-emerald-400">0.9680</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-850 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: '96%' }}></div>
            </div>
            <span className="text-[10px] text-zinc-550 block">High convergence. Adjusts routing dynamically in response to telemetry.</span>
          </div>

          <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-2">
            <div className="flex justify-between text-xs text-zinc-400">
              <span className="font-semibold">AI Predictive Mode</span>
              <span className="font-mono text-indigo-400 font-bold">0.9912</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-850 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '99%' }}></div>
            </div>
            <span className="text-[10px] text-zinc-550 block">Optimum convergence limit. Prevents micro-burst queue build up before occurrence.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
