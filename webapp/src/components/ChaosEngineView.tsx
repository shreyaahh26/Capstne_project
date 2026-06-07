import React, { useState } from 'react';
import { PowerOff, CheckCircle, RefreshCw, AlertTriangle, ShieldAlert, Server, FileText, Bot, X } from 'lucide-react';
import { VMNode, LogEntry } from '../types';
import Markdown from 'react-markdown';

export default function ChaosEngineView({ 
  nodes, 
  logs,
  onAddLog 
}: { 
  nodes: VMNode[], 
  logs: LogEntry[],
  onAddLog: (sys: string, level: any, msg: string) => void 
}) {
  const [loadingNode, setLoadingNode] = useState<string | null>(null);
  const [analyzingNode, setAnalyzingNode] = useState<string | null>(null);
  const [chaosDisabled, setChaosDisabled] = useState(false);
  const [postMortemReport, setPostMortemReport] = useState<{ node: string; report: string } | null>(null);

  const triggerChaos = async (nodeId: string) => {
    setLoadingNode(nodeId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/nodes/${nodeId}/fail`, {
        method: 'POST'
      });
      if (res.ok) {
        onAddLog('CHAOS_ENGINE', 'warn', `Injected simulated fault into node: ${nodeId}`);
      } else {
        onAddLog('CHAOS_ENGINE', 'error', `Failed to inject fault into node: ${nodeId}`);
      }
    } catch(err) {
      onAddLog('CHAOS_ENGINE', 'error', `Connection error during fault injection on ${nodeId}`);
    }
    setLoadingNode(null);
  };

  const triggerRecover = async (nodeId: string) => {
    setLoadingNode(nodeId);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/nodes/${nodeId}/recover`, {
        method: 'POST'
      });
      if (res.ok) {
        onAddLog('CHAOS_ENGINE', 'info', `Recovered simulated fault on node: ${nodeId}`);
      } else {
        onAddLog('CHAOS_ENGINE', 'error', `Failed to recover fault on node: ${nodeId}`);
      }
    } catch(err) {
      onAddLog('CHAOS_ENGINE', 'error', `Connection error during recovery on ${nodeId}`);
    }
    setLoadingNode(null);
  };

  const triggerAnalyze = async (nodeId: string) => {
    setAnalyzingNode(nodeId);
    try {
      const failedNodeData = nodes.find(n => n.name === nodeId);
      const metrics = {
        load: failedNodeData?.currentLoad,
        tasksCompleted: failedNodeData?.tasksCompleted,
      };
      // Send last 25 logs
      const recentLogs = logs.slice(0, 25);
      
      const res = await fetch('/ai-api/generate-postmortem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: recentLogs, failedNode: nodeId, metrics })
      });
      
      if (res.ok) {
        const data = await res.json();
        setPostMortemReport({ node: nodeId, report: data.report });
        onAddLog('AI_SRE', 'info', `Generated automated post-mortem for incident on ${nodeId}`);
      } else {
        onAddLog('AI_SRE', 'error', `Failed to generate post-mortem for ${nodeId}`);
      }
    } catch(err) {
      onAddLog('AI_SRE', 'error', `Connection error during analysis of ${nodeId}`);
    }
    setAnalyzingNode(null);
  };

  return (
    <div className="space-y-6">
      <div className="border border-red-900/50 bg-red-950/20 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl font-bold text-red-500 font-sans tracking-tight mb-2 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Chaos Engine Control Panel
          </h2>
          <p className="text-zinc-400 text-sm max-w-2xl">
            A manual testing panel allowing you to intentionally inject simulated failures into the cluster. This lets you manually test the resilience of your distributed system and watch the auto-healer and scheduler recover the workflow in real-time.
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg cursor-pointer">
            <input 
              type="checkbox" 
              checked={chaosDisabled} 
              onChange={(e) => setChaosDisabled(e.target.checked)}
              className="accent-red-500 h-4 w-4 rounded border-zinc-700 bg-zinc-800"
            />
            Disable Chaos Safeguards
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nodes.filter(n => n.name !== 'self').map(node => (
          <div key={node.name} className="relative group p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 hover:bg-zinc-900/80 transition-all flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-mono font-bold text-zinc-100 flex items-center gap-2">
                  <Server className="h-4 w-4 text-zinc-500" />
                  {node.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Worker Node VM
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${node.isAlive ? 'border-emerald-900/30 bg-emerald-900/20 text-emerald-400' : 'border-red-900/30 bg-red-900/20 text-red-400'}`}>
                {node.isAlive ? 'Healthy' : 'Failing'}
              </div>
            </div>

            <div className="space-y-3 mb-6 flex-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Current Load</span>
                <span className="font-mono text-zinc-300">{node.currentLoad.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Tasks Handled</span>
                <span className="font-mono text-zinc-300">{node.tasksCompleted}</span>
              </div>
            </div>

            <div className="mt-auto px-1 space-y-2">
              {!node.isAlive ? (
                <>
                  <button
                    onClick={() => triggerAnalyze(node.name)}
                    disabled={analyzingNode === node.name}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-900/20 hover:bg-indigo-900/40 text-indigo-400 border border-indigo-900 rounded-lg py-2.5 font-medium text-sm transition-all disabled:opacity-50"
                  >
                    {analyzingNode === node.name ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    AI Post-Mortem
                  </button>
                  <button
                    onClick={() => triggerRecover(node.name)}
                    disabled={loadingNode === node.name}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900 rounded-lg py-2.5 font-medium text-sm transition-all disabled:opacity-50"
                  >
                    {loadingNode === node.name ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Heal Node
                  </button>
                </>
              ) : (
                <button
                  onClick={() => triggerChaos(node.name)}
                  disabled={!chaosDisabled || loadingNode === node.name}
                  className="w-full flex items-center justify-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900 rounded-lg py-2.5 font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:disabled:bg-red-950/20"
                  title={!chaosDisabled ? "Check 'Disable Chaos Safeguards' to inject faults." : "Inject simulated failure"}
                >
                  {loadingNode === node.name ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                  Kill Node
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {nodes.filter(n => n.name !== 'self').length === 0 && (
        <div className="py-16 text-center text-zinc-500 border border-zinc-900/50 bg-zinc-900/20 rounded-xl">
          <AlertTriangle className="h-10 w-10 mx-auto text-zinc-700 mb-4" />
          <p>No worker nodes are currently registered via Gossip Protocol.</p>
        </div>
      )}

      {/* AI Post-Mortem Modal */}
      {postMortemReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-3xl w-full flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                AI Incident Post-Mortem: {postMortemReport.node}
              </h3>
              <button 
                onClick={() => setPostMortemReport(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="markdown-body prose prose-invert prose-indigo max-w-none prose-sm leading-relaxed text-zinc-300">
                <Markdown>{postMortemReport.report}</Markdown>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
              <button
                onClick={() => setPostMortemReport(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
