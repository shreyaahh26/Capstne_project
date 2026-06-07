import React, { useState } from 'react';
import { Cloud, Play, Square, RefreshCcw, Server } from 'lucide-react';

export default function AzureTestView() {
  const [vms, setVms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>('');
  
  const handleListVms = async () => {
    setLoading(true);
    addLog('Fetching VM list...');
    try {
      const res = await fetch('/api/v1/azure/vms');
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error(`Backend unreachable (Status: ${res.status}). Ensure the Python server is running.`);
      }

      if (data.success) {
        setVms(data.vms || []);
        addLog(`Success: Found ${data.vms?.length || 0} VMs.`);
      } else {
        addLog(`Error: ${data.error || data.detail || JSON.stringify(data)}`);
      }
    } catch (e: any) {
      addLog(`Request Exception: ${e.message}`);
    }
    setLoading(false);
  };
  
  const handleAction = async (vm: string, action: string) => {
    setLoading(true);
    addLog(`Initiating ${action} for ${vm}...`);
    try {
      const res = await fetch(`/api/v1/azure/vms/${vm}${action !== 'status' ? '/' + action : ''}`, {
        method: action === 'status' ? 'GET' : 'POST'
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error(`Backend unreachable (Status: ${res.status}). Ensure the Python server is running.`);
      }

      addLog(`Response from Azure for ${vm}: \n${JSON.stringify(data, null, 2)}`);
      
      if (action === 'status' && data.success) {
        // Update local VM list state correctly dynamically
        setVms(prev => prev.map(v => v.name === vm ? { ...v, state: data.state } : v));
      }
    } catch (e: any) {
      addLog(`Request Exception: ${e.message}`);
    }
    setLoading(false);
  };
  
  const addLog = (msg: string) => {
    setOutput(prev => `[${new Date().toLocaleTimeString()}] ${msg}\n${prev}`);
  };

  return (
    <div className="space-y-6 text-zinc-100 p-4">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <Server className="h-6 w-6 text-blue-400" />
        <h2 className="text-xl font-bold text-zinc-200">Raw Azure API Tests</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <button
            onClick={handleListVms}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'List All VMs from Azure'}
          </button>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vms.map(vm => (
              <div key={vm.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col justify-between items-start gap-4">
                <div className="w-full">
                  <div className="font-bold text-zinc-100">{vm.name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">State: <span className="font-mono text-zinc-200">{vm.state}</span></div>
                  <div className="text-xs text-zinc-500">{vm.size}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs shrink-0 w-full">
                  <button onClick={() => handleAction(vm.name, 'status')} className="flex-1 py-1.5 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 rounded flex justify-center"><RefreshCcw className="w-4 h-4" /></button>
                  <button onClick={() => handleAction(vm.name, 'start')} className="flex-1 py-1.5 bg-green-900 border-green-800 hover:bg-green-800 text-green-300 rounded flex justify-center"><Play className="w-4 h-4" /></button>
                  <button onClick={() => handleAction(vm.name, 'stop')} className="flex-1 py-1.5 bg-red-900 border-red-800 hover:bg-red-800 text-red-300 rounded flex justify-center"><Square className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 h-[400px] md:h-[600px] flex flex-col">
          <div className="text-xs font-bold text-zinc-500 mb-2 font-mono uppercase">Raw Responses / Logs</div>
          <pre className="flex-1 overflow-auto text-[11px] font-mono whitespace-pre-wrap text-emerald-400">
            {output || 'Awaiting execution...'}
          </pre>
        </div>
      </div>
    </div>
  );
}
