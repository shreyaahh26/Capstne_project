import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Settings, 
  Cpu, 
  Play, 
  CheckCircle, 
  TrendingUp, 
  Sliders, 
  HelpCircle, 
  Compass, 
  RefreshCw,
  Clock,
  Gauge
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { VMNode } from '../types';
import { motion } from 'motion/react';

interface AISchedulerProps {
  nodes: VMNode[];
  onTriggerTraining?: () => void;
}

export default function AISchedulerView({ nodes, onTriggerTraining }: AISchedulerProps) {
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'training' | 'completed'>('completed');
  const [epochs, setEpochs] = useState<number>(100);
  const [learningRate, setLearningRate] = useState<number>(0.05);

  // History values for Predictions vs Actual workloads
  const [comparisonData, setComparisonData] = useState<any[]>([]);

  useEffect(() => {
    const liveNodes = nodes.filter(n => n.isAlive);
    if (liveNodes.length === 0) return;
    
    // Using currentLoad from actual CPU, and predictedLoad from AI
    const avgActual = liveNodes.reduce((acc, n) => acc + n.currentLoad, 0) / liveNodes.length;
    const avgPredicted = liveNodes.reduce((acc, n) => acc + (n.predictedLoad || n.currentLoad), 0) / liveNodes.length;
    
    setComparisonData(prev => {
      const now = new Date().toLocaleTimeString();
      const newData = [...prev, { step: now, Actual: avgActual, Predicted: avgPredicted }];
      return newData.slice(-30); // Keep last 30 readings
    });
  }, [nodes]);

  const handleTrainModel = () => {
    setTrainingStatus('training');
    setTimeout(() => {
      setTrainingStatus('completed');
      if (onTriggerTraining) onTriggerTraining();
    }, 1500);
  };

  return (
    <div className="space-y-6 text-zinc-100" id="ai-scheduler-container">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-850 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Linear Regression Predictive Dispatcher</h2>
          <p className="text-xs text-zinc-500">Autonomous modeling and workload anticipation system powered by scikit-learn.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-indigo-950/40 border border-indigo-900/60 rounded text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider">
            Framework: C++ Scikit-Learn Wrapper
          </span>
        </div>
      </div>

      {/* Model Spec Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ML Weights Chart Column */}
        <div className="lg:col-span-2 p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-805">
            <div>
              <h3 className="text-sm font-semibold text-zinc-350 font-sans flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                Dual Load Projection Monitor (Predicted vs Actual Load)
              </h3>
              <p className="text-[11px] text-zinc-500">Illustrates temporal predictions compared to actual cluster execution demand</p>
            </div>
            <span className="text-[10px] font-mono bg-violet-950/25 border border-violet-900/40 text-violet-400 px-2 py-0.5 rounded font-bold animate-pulse">
              Live Evaluation
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                <XAxis dataKey="step" stroke="#52525b" fontSize={9} fontFamily="JetBrains Mono" />
                <YAxis stroke="#52525b" fontSize={9} fontFamily="JetBrains Mono" domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Predicted" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Training Parameters controls */}
        <div className="p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
              <Sliders className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Model Hyper-parameters</h3>
            </div>

            {/* Hyperparameters inputs */}
            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-semibold block">Training Epochs Limit</label>
                <select 
                  value={epochs} 
                  onChange={(e) => setEpochs(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 font-mono text-zinc-300 focus:outline-none"
                >
                  <option value={50}>50 (Fast Convergence)</option>
                  <option value={100}>100 (Balanced Fit)</option>
                  <option value={200}>200 (High-Precision Audit)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-400 font-semibold">Ridge Regularization Alpha</label>
                  <span className="font-mono text-emerald-400">{learningRate}</span>
                </div>
                <input 
                  type="range" 
                  min="0.01" 
                  max="0.5" 
                  step="0.01"
                  value={learningRate}
                  onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 mt-1 cursor-grab"
                />
              </div>

              <div className="bg-zinc-950/60 border border-zinc-850/60 rounded-xl p-3 space-y-1 text-[11px] font-mono text-zinc-450 leading-relaxed">
                <div className="flex justify-between text-zinc-400">
                  <span>Input dataset size:</span>
                  <span className="text-zinc-200">12 rows tracked</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Regression mode:</span>
                  <span className="text-zinc-200">Ridge Regularized L2</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleTrainModel}
            disabled={trainingStatus === 'training'}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 font-sans font-bold text-xs rounded-xl tracking-wider uppercase text-white cursor-pointer transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${trainingStatus === 'training' ? 'animate-spin' : ''}`} />
            {trainingStatus === 'training' ? 'Fitting Regression Plane...' : 'Force Fit & Retrain Model'}
          </button>
        </div>

      </div>

      {/* Regression Features map details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Feature 1 */}
        <div className="p-5 bg-zinc-900/20 border border-zinc-850 rounded-2xl flex flex-col justify-between h-34">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400 font-sans">Current System Load (W₁)</span>
            <span className="text-[10px] bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 font-mono px-1.5 py-0.5 rounded">
              Weight: +0.65
            </span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 space-y-2">
            <div className="h-1.5 rounded-full bg-zinc-950 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: '65%' }}></div>
            </div>
            <p className="text-[10px] pt-1">
              Provides the structural anchor load coefficient. Strongly linear relation to immediate future queue status.
            </p>
          </div>
        </div>

        {/* Feature 2 */}
        <div className="p-5 bg-zinc-900/20 border border-zinc-850 rounded-2xl flex flex-col justify-between h-34">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400 font-sans">Queue Length pending (W₂)</span>
            <span className="text-[10px] bg-indigo-950/30 border border-indigo-900/40 text-indigo-400 font-mono px-1.5 py-0.5 rounded">
              Weight: +0.28
            </span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 space-y-2">
            <div className="h-1.5 rounded-full bg-zinc-950 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '28%' }}></div>
            </div>
            <p className="text-[10px] pt-1">
              Captures jobs lingering in buffer queues. Avoids static strategy herd bottlenecks on single endpoints.
            </p>
          </div>
        </div>

        {/* Feature 3 */}
        <div className="p-5 bg-zinc-900/20 border border-zinc-850 rounded-2xl flex flex-col justify-between h-34">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400 font-sans">Time Intercept Seasonality (W₀)</span>
            <span className="text-[10px] bg-amber-950/30 border border-amber-900/40 text-amber-405 font-mono px-1.5 py-0.5 rounded">
              Weight: +0.06
            </span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 space-y-2">
            <div className="h-1.5 rounded-full bg-zinc-950 overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: '6%' }}></div>
            </div>
            <p className="text-[10px] pt-1">
              Represents non-cyclic time drift values. Keeps prediction boundaries within logical physical limiters (0-100%).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
