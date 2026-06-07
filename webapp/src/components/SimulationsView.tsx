import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Settings, 
  Activity, 
  Server, 
  Download,
  AlertCircle,
  FileText,
  Clock,
  Cpu,
  BarChart2,
  HardDrive
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
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';
import { VMNode, Task } from '../types';

interface ActiveSimulation {
  status: 'idle' | 'running' | 'completed' | 'failed';
  algorithm: 'static' | 'round_robin' | 'least_loaded' | 'fairness' | 'predictive';
  workload: 'normal' | 'burst' | 'heavy' | 'failure';
  duration: number;
  startTime: number | null;
  tasksSent: number;
  tasksCompleted: number;
  tasksFailed: number;
  latencySum: number;
  maxLatency: number;
  minLatency: number;
  history: any[];
  taskLog: any[];
  nodeStats: Record<string, { completed: number, failed: number, sumLatency: number, samples: number, cpu: number, memory: number }>;
}

interface SimulationsViewProps {
  nodes: VMNode[];
  // Keep existing standard props to prevent App.tsx from breaking
  selectedStrategy?: string;
  onChangeStrategy?: (strategy: any) => void;
  simulationLog?: Task[];
  isSimulating?: boolean;
  onToggleSimulator?: () => void;
  simSpeed?: number;
  onChangeSpeed?: (ms: number) => void;
  onDispatchTask?: (type: 'normal' | 'burst' | 'heavy') => void;
  onClearLogs?: () => void;
  onImportCsvLogs?: (importedTasks: Task[]) => void;
}

export default function SimulationsView({ nodes }: SimulationsViewProps) {
  // Configuration
  const [draftAlgo, setDraftAlgo] = useState<'static' | 'round_robin' | 'least_loaded' | 'fairness' | 'predictive'>('least_loaded');
  const [draftWorkload, setDraftWorkload] = useState<'normal' | 'burst' | 'heavy' | 'failure'>('normal');
  const [draftDuration, setDraftDuration] = useState<number>(30);

  // Simulation State
  const [simState, setSimState] = useState<ActiveSimulation>({
    status: 'idle',
    algorithm: 'least_loaded',
    workload: 'normal',
    duration: 30,
    startTime: null,
    tasksSent: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    latencySum: 0,
    maxLatency: 0,
    minLatency: 99999,
    history: [],
    taskLog: [],
    nodeStats: {}
  });

  const [realtimeNodes, setRealtimeNodes] = useState<VMNode[]>(nodes);
  useEffect(() => {
    // Keep nodes up to date from props
    setRealtimeNodes(nodes);
  }, [nodes]);

  const runningRef = useRef<boolean>(false);

  const startSimulation = () => {
    // wipe previous backend logs if possible to start clean
    fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/simulations/logs', { method: 'DELETE' }).catch(() => {});

    // initialize nodeStats for all known nodes
    const initialNodeStats: Record<string, any> = {};
    nodes.forEach(n => {
      initialNodeStats[n.name] = { completed: 0, failed: 0, sumLatency: 0, samples: 0, cpu: 0, memory: 0 };
    });

    setSimState({
      status: 'running',
      algorithm: draftAlgo,
      workload: draftWorkload,
      duration: draftDuration,
      startTime: Date.now(),
      tasksSent: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      latencySum: 0,
      maxLatency: 0,
      minLatency: 99999,
      history: [],
      taskLog: [],
      nodeStats: initialNodeStats
    });
    runningRef.current = true;
    runLoop();
  };

  const stopSimulation = () => {
    runningRef.current = false;
    setSimState(prev => prev.status === 'running' ? { ...prev, status: 'completed' } : prev);
  };

  const runLoop = async () => {
    const intervalMs = draftWorkload === 'burst' ? 50 : draftWorkload === 'heavy' ? 200 : draftWorkload === 'failure' ? 100 : 300;
    const complexity = draftWorkload === 'heavy' ? 0.8 : draftWorkload === 'burst' ? 0.4 : draftWorkload === 'failure' ? 0.9 : 0.15;
    
    let localSent = 0;
    
    while (runningRef.current) {
      const res = await new Promise<boolean>(resolve => {
        setSimState(prev => {
          if (!runningRef.current) { resolve(false); return prev; }
          const elapsed = (Date.now() - (prev.startTime || Date.now())) / 1000;
          if (elapsed >= prev.duration) {
            runningRef.current = false;
            resolve(false);
            return { ...prev, status: 'completed' };
          }
          resolve(true);
          return prev;
        });
      });

      if (!res) break;

      localSent++;
      
      // Dispatch Real Traffic
      fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/tasks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: `task-${String(localSent).padStart(4, '0')}`,
          task_type: draftWorkload,
          complexity: complexity,
          strategy: draftAlgo
        })
      }).then(async r => {
        let payload;
        try { payload = await r.json(); } catch(e) { payload = {}; }
        return { ok: r.ok, data: payload, status: r.status };
      }).then(({ ok, data, status }) => {
        if (!runningRef.current && simState.status !== 'running') return; 
        
        setSimState(prev => {
          if (prev.status === 'idle') return prev;
          
          const isFailed = !ok || data.status === 'failed' || !!data.error || !!data.detail;
          const detail = data.detail || {};
          const latency = data.execution_time || data.latency_s || 0;
          const worker = data.worker_node || data.worker || data.node_id || detail.worker_node || (isFailed ? 'unknown' : 'unknown');
          const cpuVal = data.cpu !== undefined ? data.cpu : (detail.cpu !== undefined ? detail.cpu : 0);
          const memVal = data.memory !== undefined ? data.memory : (detail.memory !== undefined ? detail.memory : 0);
          
          const newStats = { ...prev.nodeStats };
          if (worker !== 'unknown' && !newStats[worker]) {
            newStats[worker] = { completed: 0, failed: 0, sumLatency: 0, samples: 0, cpu: 0, memory: 0 };
          }
          
          if (worker !== 'unknown') {
            if (isFailed) {
              newStats[worker].failed += 1;
            } else {
              newStats[worker].completed += 1;
              newStats[worker].sumLatency += latency;
              newStats[worker].samples += 1;
            }
            newStats[worker].cpu = cpuVal;
            newStats[worker].memory = memVal;
          }
          
          const elapsed = (Date.now() - (prev.startTime || Date.now())) / 1000;
          const tps = prev.tasksCompleted / Math.max(elapsed, 1);
          const newHist = [...prev.history, { 
            time: elapsed.toFixed(1),
            latency: latency * 1000,
            throughput: parseFloat(tps.toFixed(1))
          }].slice(-60);

          const newTask = {
            task_id: `task-${String(localSent).padStart(4, '0')}`,
            type: draftWorkload,
            complexity: complexity,
            worker: worker,
            strategy: draftAlgo,
            latency_s: latency,
            status: isFailed ? 'failed' : 'completed',
            reason: data.error || data.detail || (isFailed ? `Error ${status}` : ''),
            timestamp: new Date().toISOString()
          };

          return {
            ...prev,
            tasksSent: Math.max(prev.tasksSent, localSent),
            tasksCompleted: prev.tasksCompleted + (isFailed ? 0 : 1),
            tasksFailed: prev.tasksFailed + (isFailed ? 1 : 0),
            latencySum: prev.latencySum + latency,
            maxLatency: Math.max(prev.maxLatency, latency),
            minLatency: latency > 0 ? Math.min(prev.minLatency, latency) : prev.minLatency,
            history: newHist,
            taskLog: [...prev.taskLog, newTask],
            nodeStats: newStats
          };
        });
      }).catch(() => {
        setSimState(prev => ({
          ...prev, 
          tasksSent: Math.max(prev.tasksSent, localSent),
          tasksFailed: prev.tasksFailed + 1 
        }));
      });
      
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };

  const handleDownloadCsv = () => {
    // Generate CSV from taskLog
    if (!simState.taskLog || simState.taskLog.length === 0) return;

    const headers = ["task_id", "type", "complexity", "worker", "strategy", "latency_s", "status", "reason", "timestamp"];
    const csvContent = [
      headers.join(','),
      ...simState.taskLog.map(task => 
        headers.map(header => {
          const val = task[header as keyof typeof task];
          return val === undefined || val === null ? '' : val;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `simulation_results_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Computation helpers
  const formatMs = (latencySum: number, count: number) => {
    if (count === 0) return '0.0';
    return ((latencySum / count) * 1000).toFixed(1);
  };
  
  const elapsedSec = simState.startTime 
    ? (simState.status === 'running' ? (Date.now() - simState.startTime) / 1000 : simState.duration) 
    : 0;
    
  const progress = simState.duration ? Math.min(100, Math.max(0, (elapsedSec / simState.duration) * 100)) : 0;
  const currentThroughput = elapsedSec > 0 ? (simState.tasksCompleted / elapsedSec).toFixed(1) : '0.0';

  // Derived arrays for charts
  const nodeChartData = Object.entries(simState.nodeStats).map(([name, stats]: [string, any]) => ({
    name,
    cpu: parseFloat(stats.cpu.toFixed(1)),
    memory: parseFloat(stats.memory.toFixed(1)),
    tasks: stats.completed,
    avgLatency: stats.samples > 0 ? parseFloat((stats.sumLatency / stats.samples * 1000).toFixed(1)) : 0
  }));

  return (
    <div className="space-y-6 text-zinc-100 font-sans pb-12 w-full max-w-7xl mx-auto">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-400" />
            Azure Distributed Simulation
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time execution interface targeting physical Azure infrastructure.
          </p>
        </div>
        <div className="flex gap-3">
          {simState.status === 'running' ? (
            <button 
              onClick={stopSimulation} 
              className="px-6 py-2.5 rounded-xl text-sm font-bold border border-rose-900/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Square className="h-4 w-4" /> Stop Simulation
            </button>
          ) : (
            <button 
              onClick={startSimulation} 
              className="px-6 py-2.5 rounded-xl text-sm font-bold border border-emerald-900/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-900/20"
            >
              <Play className="h-4 w-4" /> Start Simulation
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1 - CONFIGURATION */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-violet-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Simulation Configuration</h3>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Algorithm</label>
            <select 
              value={draftAlgo} 
              onChange={(e) => setDraftAlgo(e.target.value as any)}
              disabled={simState.status === 'running'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm font-medium text-zinc-200 focus:border-indigo-500 outline-none disabled:opacity-50"
            >
              <option value="static">Static Allocation</option>
              <option value="round_robin">Round Robin</option>
              <option value="least_loaded">Least Loaded</option>
              <option value="fairness">Fairness Balancer</option>
              <option value="predictive">AI Predictive</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Workload Class</label>
            <div className="grid grid-cols-2 gap-2">
              {(['normal', 'burst', 'heavy', 'failure'] as const).map(w => (
                <button
                  key={w}
                  onClick={() => setDraftWorkload(w)}
                  disabled={simState.status === 'running'}
                  className={`py-3 rounded-xl text-sm font-bold capitalize transition-all border cursor-pointer disabled:opacity-50 ${
                    draftWorkload === w 
                      ? (w === 'failure' ? 'bg-rose-500/10 border-rose-500/50 text-rose-300' : 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300') 
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:bg-zinc-900'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                Duration: <span className="text-zinc-200">{draftDuration} seconds</span>
              </label>
              <input 
                type="range" 
                min="10" max="300" step="10" 
                value={draftDuration} 
                onChange={(e) => setDraftDuration(parseInt(e.target.value))}
                disabled={simState.status === 'running'}
                className="w-full accent-indigo-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800/50">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Target Azure Nodes</label>
              <div className="flex flex-wrap gap-2">
                {realtimeNodes.length > 0 ? realtimeNodes.map(n => (
                  <span key={n.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${n.isAlive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    {n.name}
                  </span>
                )) : (
                  <span className="text-xs text-zinc-500 italic">No nodes available</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 - LIVE EXECUTION STATUS */}
      {(simState.status === 'running' || simState.status === 'completed') && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
            <div 
              className={`h-full transition-all duration-300 ${simState.status === 'completed' ? 'bg-indigo-500' : 'bg-emerald-500'}`} 
              style={{ width: `${progress}%` }} 
            />
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 mt-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Live Execution Status</h3>
              </div>
              <p className="text-zinc-500 text-sm">
                Status: <strong className={simState.status === 'running' ? 'text-emerald-400 animate-pulse' : 'text-indigo-400'}>{simState.status.toUpperCase()}</strong>
                {' | '} {elapsedSec.toFixed(1)}s elapsed
              </p>
            </div>
            <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 px-4 py-2 rounded-xl">
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase font-bold">Algorithms & Workload</p>
                <p className="text-xs text-zinc-200 capitalize font-medium">{simState.algorithm.replace('_', ' ')} / {simState.workload}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
              <div className="text-[11px] uppercase font-bold text-zinc-500 mb-1">Tasks Completed</div>
              <div className="text-2xl font-mono text-zinc-100">{simState.tasksCompleted}</div>
              <div className="text-[10px] text-zinc-500 mt-1">out of {Math.max(simState.tasksSent, simState.tasksCompleted)}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
              <div className="text-[11px] uppercase font-bold text-zinc-500 mb-1">Failed Tasks</div>
              <div className="text-2xl font-mono text-rose-400">{simState.tasksFailed}</div>
              <div className="text-[10px] text-zinc-500 mt-1">errors recorded</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
              <div className="text-[11px] uppercase font-bold text-zinc-500 mb-1">Avg Latency</div>
              <div className="text-2xl font-mono text-indigo-400">{formatMs(simState.latencySum, simState.tasksCompleted)}ms</div>
              <div className="text-[10px] text-zinc-500 mt-1">end-to-end execution</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
              <div className="text-[11px] uppercase font-bold text-zinc-500 mb-1">Current Throughput</div>
              <div className="text-2xl font-mono text-emerald-400">{currentThroughput}</div>
              <div className="text-[10px] text-zinc-500 mt-1">tasks / second</div>
            </div>
          </div>

          {/* REAL-TIME VISUALIZATION CHARTS */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 h-64">
              <h4 className="text-[11px] uppercase font-bold text-zinc-500 mb-4 flex items-center justify-between">
                <span>Latency Trend</span>
                <span className="text-indigo-400">ms</span>
              </h4>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simState.history}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis tick={{fontSize: 10, fill: '#71717a'}} width={30} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="latency" stroke="#818cf8" fillOpacity={1} fill="url(#colorLatency)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 h-64">
              <h4 className="text-[11px] uppercase font-bold text-zinc-500 mb-4 flex items-center justify-between">
                <span>Task Throughput</span>
                <span className="text-emerald-400">tasks/s</span>
              </h4>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simState.history}>
                  <defs>
                    <linearGradient id="colorTps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis tick={{fontSize: 10, fill: '#71717a'}} width={30} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} />
                  <Area type="stepAfter" dataKey="throughput" stroke="#34d399" fillOpacity={1} fill="url(#colorTps)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3 - LIVE NODE RESULTS */}
      {(simState.status === 'running' || simState.status === 'completed') && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Server className="h-5 w-5 text-sky-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Live Node Results</h3>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Object.entries(simState.nodeStats).length === 0 ? (
              <div className="col-span-full py-8 text-center text-zinc-500 italic text-sm border border-zinc-800 border-dashed rounded-xl">
                Waiting for distributed telemetry from Azure VMs...
              </div>
            ) : Object.entries(simState.nodeStats).map(([nodeName, stats]: [string, any]) => {
              const isActive = stats.completed > 0 && simState.status === 'running';
              const avgLat = stats.samples > 0 ? (stats.sumLatency / stats.samples) * 1000 : 0;
              return (
                <div key={nodeName} className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-md">
                  <div className="bg-zinc-900/80 px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
                    <span className="font-mono text-zinc-200 text-xs font-bold">{nodeName}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}>
                      {isActive ? 'Running' : 'Idle'}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-zinc-500 font-bold uppercase">Tasks Done</span>
                      <span className="font-mono text-sm text-zinc-200">{stats.completed}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-zinc-500 font-bold uppercase">CPU Usage</span>
                      <span className="font-mono text-sm text-amber-400">{stats.cpu.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-zinc-500 font-bold uppercase">Memory</span>
                      <span className="font-mono text-sm text-sky-400">{stats.memory.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-800/50">
                      <span className="text-[11px] text-zinc-500 font-bold uppercase">Avg Latency</span>
                      <span className="font-mono text-sm text-indigo-400">{avgLat.toFixed(1)}ms</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {Object.keys(simState.nodeStats).length > 0 && (
            <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 h-64">
              <h4 className="text-[11px] uppercase font-bold text-zinc-500 mb-4">Worker Load Distribution</h4>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nodeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" tick={{fontSize: 10, fill: '#a1a1aa'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 10, fill: '#71717a'}} width={30} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{fill: '#27272a', opacity: 0.4}} contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} />
                  <Bar dataKey="tasks" fill="#818cf8" radius={[4, 4, 0, 0]} name="Tasks Computed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* SIMULATION COMPLETION REPORT */}
      {simState.status === 'completed' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Simulation Completion Report</h3>
            </div>
            <button 
              onClick={handleDownloadCsv}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Download className="h-4 w-4" /> Download Results CSV
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 bg-zinc-950 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
              <FileText className="h-64 w-64 -mt-12 -mr-12" />
            </div>
            
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Timestamp</span>
                <span className="text-sm font-mono text-zinc-300">{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Algorithm</span>
                <span className="text-sm text-zinc-300 capitalize">{simState.algorithm.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Workload Type</span>
                <span className="text-sm text-zinc-300 capitalize">{simState.workload}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Duration</span>
                <span className="text-sm text-zinc-300 font-mono">{simState.duration} seconds</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Total Tasks</span>
                <span className="text-sm text-zinc-300 font-mono">{Math.max(simState.tasksSent, simState.tasksCompleted + simState.tasksFailed)}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Completed Tasks</span>
                <span className="text-sm text-emerald-400 font-mono font-bold">{simState.tasksCompleted}</span>
              </div>
            </div>
            
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Failed Tasks</span>
                <span className="text-sm text-rose-400 font-mono font-bold">{simState.tasksFailed}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Average Latency</span>
                <span className="text-sm text-indigo-400 font-mono font-bold">{formatMs(simState.latencySum, simState.tasksCompleted)}ms</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Maximum Latency</span>
                <span className="text-sm text-zinc-300 font-mono">{simState.maxLatency > 0 ? (simState.maxLatency * 1000).toFixed(1) : '0.0'}ms</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Minimum Latency</span>
                <span className="text-sm text-zinc-300 font-mono">{simState.minLatency !== 99999 ? (simState.minLatency * 1000).toFixed(1) : '0.0'}ms</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Throughput</span>
                <span className="text-sm text-emerald-400 font-mono">{currentThroughput} tps</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800/60 pb-2">
                <span className="text-[11px] uppercase font-bold text-zinc-500">Success Rate</span>
                <span className="text-sm text-emerald-400 font-mono font-bold">
                  {simState.tasksCompleted > 0 ? ((simState.tasksCompleted / (simState.tasksCompleted + simState.tasksFailed)) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
