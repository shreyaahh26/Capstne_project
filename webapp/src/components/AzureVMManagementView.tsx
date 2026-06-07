import { useState, useEffect } from 'react';
import { 
  Cloud, 
  Terminal, 
  Power, 
  RefreshCw, 
  Zap, 
  Server, 
  CheckCircle, 
  XOctagon, 
  Activity, 
  Play, 
  Database,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Info,
  ChevronRight
} from 'lucide-react';
import { VMNode } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AzureVMManagementProps {
  nodes: VMNode[];
  onTriggerPowerCycle: (nodeName: string, action: 'start' | 'stop' | 'restart') => Promise<any>;
  onTriggerDeployExporter: (nodeName: string) => Promise<any>;
  onExecuteSsh: (nodeName: string, command: string) => Promise<any>;
  onAddLog: (source: string, level: 'info' | 'warn' | 'error' | 'system', message: string) => void;
}

export default function AzureVMManagementView({
  nodes,
  onTriggerPowerCycle,
  onTriggerDeployExporter,
  onExecuteSsh,
  onAddLog
}: AzureVMManagementProps) {
  // Shell / SSH states
  const [sshNode, setSshNode] = useState<string>('worker-vm-1');
  const [sshCommand, setSshCommand] = useState<string>('uname -a && systemctl is-active distributed-node');
  const [sshExecuting, setSshExecuting] = useState<boolean>(false);
  const [sshOutput, setSshOutput] = useState<any>(null);
  
  // Power states tracker
  const [powerLoading, setPowerLoading] = useState<Record<string, boolean>>({});
  const [installingNode, setInstallingNode] = useState<string | null>(null);
  
  // Real Azure statuses
  const [azureStatuses, setAzureStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    const fetchAzureStatus = async () => {
      try {
        const res = await fetch('/api/v1/azure/vms');
        if (!res.ok) return;
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (data.success && isMounted) {
          const statuses: Record<string, string> = {};
          data.vms.forEach((vm: any) => {
            statuses[vm.name] = vm.state;
          });
          setAzureStatuses(statuses);
        }
      } catch (e) {
        // silently fail or log
      }
    };
    
    // Initial fetch
    fetchAzureStatus();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchAzureStatus, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Run power command
  const handlePowerAction = async (nodeName: string, action: 'start' | 'stop' | 'restart') => {
    setPowerLoading(prev => ({ ...prev, [`${nodeName}-${action}`]: true }));
    onAddLog('AZURE CLOUD', 'info', `Initiating Azure ${action.toUpperCase()} command for ${nodeName}...`);
    try {
      const data = await onTriggerPowerCycle(nodeName, action);
      onAddLog('AZURE CLOUD', 'system', `Azure subscription confirmed ${action.toUpperCase()} on ${nodeName}: ${data.message || 'success'}`);
    } catch (e: any) {
      onAddLog('AZURE CLOUD', 'error', `Failed to deliver AWS/Azure VM power command to ${nodeName}: ${e?.message || 'timeout'}`);
    } finally {
      setPowerLoading(prev => ({ ...prev, [`${nodeName}-${action}`]: false }));
    }
  };

  // Run SSH
  const handleExecuteSsh = async () => {
    setSshExecuting(true);
    onAddLog('SSH ORCHESTRATION', 'info', `Executing secure SSH command on ${sshNode}: "${sshCommand}"`);
    try {
      const data = await onExecuteSsh(sshNode, sshCommand);
      setSshOutput(data);
      onAddLog('SSH ORCHESTRATION', 'system', `Completed command over SSH on ${sshNode}. Exit Code: ${data.exit_code}`);
    } catch (e: any) {
      setSshOutput({
        node_id: sshNode,
        command: sshCommand,
        exit_code: -1,
        stdout: "",
        stderr: `Remote SSH connection failed: ${e?.message || 'timeout'}`
      });
      onAddLog('SSH ORCHESTRATION', 'error', `SSH connection failed for host ${sshNode}.`);
    } finally {
      setSshExecuting(false);
    }
  };

  // Deploy exporter
  const handleDeployExporter = async (nodeName: string) => {
    setInstallingNode(nodeName);
    onAddLog('AUTO-INSTALLER', 'info', `Triggered automatic distributed exporter installation over SSH for ${nodeName}...`);
    try {
      const data = await onTriggerDeployExporter(nodeName);
      onAddLog('AUTO-INSTALLER', 'system', `Automated script complete for ${nodeName}. Exporter live: ${data.message}`);
    } catch (e: any) {
      onAddLog('AUTO-INSTALLER', 'error', `Failed to deploy exporter. Check Azure connectivity for ${nodeName}.`);
    } finally {
      setInstallingNode(null);
    }
  };

  return (
    <div className="space-y-6 text-zinc-100" id="azure-management-container">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-850 gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">Azure Infrastructure Control & Remote Operations</h2>
          <p className="text-xs text-zinc-500">Manage Azure VM lifecycle, deploy monitoring agents, and execute secure remote commands over SSH.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-mono bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-350 select-all">
            Resource Group: <span className="text-zinc-100 font-bold">distributed-system-rg</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Cloud VM Status & Controls */}
        <div className="p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-805">
            <Cloud className="h-4 w-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Physical Azure Virtual Machines</h3>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {nodes.map(node => {
              const azureState = azureStatuses[node.name] || 'unknown';
              const isRunning = azureState === 'running';
              const isUnknown = azureState === 'unknown';
              const isStopped = azureState === 'stopped';
              const isStarting = azureState === 'starting';
              const isStopping = azureState === 'stopping';

              let statusColor = 'bg-rose-500';
              let statusGlow = 'rgba(244,63,94,0.1)';
              let statusText = 'text-rose-400';
              let statusBg = 'bg-rose-500/10';
              let statusBorder = 'border-rose-500/20';

              if (isRunning) {
                statusColor = 'bg-emerald-500';
                statusGlow = 'rgba(16,185,129,0.1)';
                statusText = 'text-emerald-400';
                statusBg = 'bg-emerald-500/10';
                statusBorder = 'border-emerald-500/20';
              } else if (isStopped || isUnknown) {
                statusColor = 'bg-zinc-400';
                statusGlow = 'rgba(161,161,170,0.1)';
                statusText = 'text-zinc-300';
                statusBg = 'bg-zinc-500/10';
                statusBorder = 'border-zinc-500/20';
              } else if (isStarting) {
                statusColor = 'bg-blue-500';
                statusGlow = 'rgba(59,130,246,0.1)';
                statusText = 'text-blue-400';
                statusBg = 'bg-blue-500/10';
                statusBorder = 'border-blue-500/20';
              } else if (isStopping) {
                statusColor = 'bg-orange-500';
                statusGlow = 'rgba(249,115,22,0.1)';
                statusText = 'text-orange-400';
                statusBg = 'bg-orange-500/10';
                statusBorder = 'border-orange-500/20';
              }
              
              return (
              <div 
                key={node.id} 
                className="p-5 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-750 transition-colors rounded-2xl flex flex-col justify-between gap-4 h-full"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{node.name}</div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-1">{node.ip}</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5 uppercase">SKU: {node.sku} • {node.region}</div>
                  </div>
                  <div className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${statusBg} ${statusText} ${statusBorder}`} style={{ boxShadow: `0 0 10px ${statusGlow}`}}>
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`}></span>
                      {azureState}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    disabled={powerLoading[`${node.name}-start`]}
                    onClick={() => handlePowerAction(node.name, 'start')}
                    className="h-[38px] text-[11px] font-bold bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 rounded-xl cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center p-0"
                  >
                    {powerLoading[`${node.name}-start`] ? 'Starting...' : 'Start'}
                  </button>

                  <button
                    disabled={powerLoading[`${node.name}-stop`]}
                    onClick={() => handlePowerAction(node.name, 'stop')}
                    className="h-[38px] text-[11px] font-bold bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-350 rounded-xl cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center p-0"
                  >
                    {powerLoading[`${node.name}-stop`] ? 'Stopping...' : 'Stop'}
                  </button>

                  <button
                    disabled={powerLoading[`${node.name}-restart`]}
                    onClick={() => handlePowerAction(node.name, 'restart')}
                    className="h-[38px] text-[11px] font-bold bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 rounded-xl cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center p-0"
                  >
                    {powerLoading[`${node.name}-restart`] ? 'Rebooting...' : 'Restart'}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* SSH Panel */}
        <div className="p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-805">
            <div className="flex items-center gap-2">
               <Terminal className="h-4 w-4 text-emerald-450" />
               <div>
                 <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Remote Command Console</h3>
                 <p className="text-[10px] text-zinc-500 lowercase mt-0.5">Execute operational commands securely on selected nodes.</p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-1">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 block mb-1">Target Instance</label>
              <select
                value={sshNode}
                onChange={(e) => setSshNode(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 font-mono text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                {nodes.map(n => (
                  <option key={n.id} value={n.name}>{n.name} ({n.ip})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 block mb-1">Interactive Script Checklists</label>
              <select
                onChange={(e) => setSshCommand(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="uname -a && systemctl is-active distributed-node">Check systemd status</option>
                <option value="free -m && df -h">Display RAM & disk volume load</option>
                <option value="cat /proc/cpuinfo | grep 'model name' | head -n 1">Evaluate CPU micro-architecture</option>
                <option value="tail -n 15 /var/log/syslog | grep 'node'">Audit nodes syslog trace histories</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase font-sans">Command</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                value={sshCommand}
                onChange={(e) => setSshCommand(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 flex-1 placeholder-zinc-700 transition-colors"
                placeholder="Enter shell command e.g. df -h"
              />
              <button
                disabled={sshExecuting}
                onClick={handleExecuteSsh}
                className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 text-emerald-400 font-bold text-xs tracking-wide uppercase rounded-xl cursor-pointer transition-all disabled:opacity-50 block text-center min-w-[120px]"
              >
                {sshExecuting ? 'Executing...' : 'Execute'}
              </button>
            </div>
          </div>

          {/* SSH Output log block */}
          <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 font-mono text-[11px] h-38 overflow-y-auto block shadow-inner relative">
            {sshOutput ? (
              <div className="space-y-2">
                <div className="flex justify-between text-zinc-650 text-[10px] border-b border-zinc-900 pb-1">
                  <span>Exit Code: {sshOutput.exit_code}</span>
                  <span>Execution Output</span>
                </div>
                {sshOutput.stdout && <pre className="text-emerald-400 whitespace-pre-wrap font-mono leading-normal">{sshOutput.stdout}</pre>}
                {sshOutput.stderr && <pre className="text-rose-400 whitespace-pre-wrap font-mono leading-normal">{sshOutput.stderr}</pre>}
              </div>
            ) : (
              <p className="text-zinc-600 py-10 text-center font-sans italic text-xs">
                Shell idle. Trigger preset commands or enter queries then hit 'Run' to execute.
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Exporter manual deployment installer */}
      <div className="p-5 border border-zinc-800 bg-zinc-900/40 rounded-2xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 font-sans flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-emerald-450 animate-pulse" />
            Monitoring Agent Deployment
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Deploy exporters and telemetry collectors to Azure worker nodes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1.5 font-sans">
          {nodes.map(n => (
            <div 
              key={n.id} 
              className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl flex flex-col justify-between items-start h-34"
            >
              <div>
                <span className="text-xs font-bold text-zinc-300 block">{n.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">{n.ip}:800{n.id.split('-')[1]}</span>
              </div>

              <button
                disabled={installingNode === n.name}
                onClick={() => handleDeployExporter(n.name)}
                className="w-full py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-350 hover:text-zinc-150 flex items-center justify-center gap-2 text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {installingNode === n.name ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin"/> Installing...
                  </>
                ) : 'Install Agent'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
