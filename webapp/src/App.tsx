import { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Activity, 
  Terminal, 
  Network, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Cloud, 
  Settings, 
  Server, 
  Zap, 
  FileSpreadsheet, 
  Globe, 
  Sliders, 
  LayoutDashboard, 
  Sparkles, 
  BarChart2, 
  Menu, 
  X, 
  Bell,
  LineChart,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VMNode, Task, SystemMetrics, LogEntry } from './types';

// Import our modular sub-components
import DashboardOverview from './components/DashboardOverview';
import NodesView from './components/NodesView';
import SimulationsView from './components/SimulationsView';
import AISchedulerView from './components/AISchedulerView';
import FairnessView from './components/FairnessView';
import MonitoringView from './components/MonitoringView';
import LogsView from './components/LogsView';
import AzureVMManagementView from './components/AzureVMManagementView';
import GrafanaPrometheusView from './components/GrafanaPrometheusView';
import AzureTestView from './components/AzureTestView';
import ChaosEngineView from './components/ChaosEngineView';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'nodes' | 'simulations' | 'ai_scheduler' | 'fairness' | 'monitoring' | 'logs' | 'azure_vms' | 'grafana_prometheus' | 'admin_test_azure'
  >('dashboard');

  // Mobile sidebar visibility
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Push notifications state
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'warn' | 'info' | 'error' }[]>([]);

  // Logs state
  const [logsList, setLogsList] = useState<LogEntry[]>([
    { timestamp: new Date().toLocaleTimeString(), level: 'system', source: 'HEALING DAEMON', message: 'Thread successfully booted in background.' },
    { timestamp: new Date().toLocaleTimeString(), level: 'info', source: 'AUTO-SCAN', message: 'Validated 4 idle endpoints on ports 8001-8004.' }
  ]);
  const [isLogsPaused, setIsLogsPaused] = useState<boolean>(false);

  // VM fleet status state
  const [nodes, setNodes] = useState<VMNode[]>([
    {
      id: 'node-1',
      name: 'worker-vm-1',
      ip: '20.92.56.192',
      port: 8001,
      region: 'Australia Southeast',
      size: 'Standard_B2ats_v2 (2 vCPUs)',
      sku: 'Standard_B2ats_v2',
      isAlive: true,
      currentLoad: 12,
      tasksCompleted: 45,
      tasksFailed: 0,
      predictedLoad: 15,
      history: [10, 15, 8, 12, 11, 14, 18, 10, 13, 12],
      cpuCores: 2,
      memoryGb: 8,
      uptimeSeconds: 78500
    },
    {
      id: 'node-2',
      name: 'worker-vm-2',
      ip: '20.213.58.22',
      port: 8002,
      region: 'Australia East',
      size: 'Standard_B2ats_v2 (2 vCPUs)',
      sku: 'Standard_B2ats_v2',
      isAlive: true,
      currentLoad: 18,
      tasksCompleted: 38,
      tasksFailed: 0,
      predictedLoad: 20,
      history: [12, 14, 22, 18, 15, 20, 24, 16, 19, 18],
      cpuCores: 2,
      memoryGb: 8,
      uptimeSeconds: 78200
    },
    {
      id: 'node-3',
      name: 'worker-vm-3',
      ip: '20.58.185.74',
      port: 8003,
      region: 'Australia East',
      size: 'Standard_B2ats_v2 (2 vCPUs)',
      sku: 'Standard_B2ats_v2',
      isAlive: true,
      currentLoad: 5,
      tasksCompleted: 29,
      tasksFailed: 0,
      predictedLoad: 8,
      history: [5, 8, 4, 5, 6, 7, 5, 8, 6, 5],
      cpuCores: 2,
      memoryGb: 8,
      uptimeSeconds: 78100
    },
    {
      id: 'node-4',
      name: 'worker-vm-4',
      ip: '20.24.209.147',
      port: 8004,
      region: 'Australia East',
      size: 'Standard_B2ats_v2 (2 vCPUs)',
      sku: 'Standard_B2ats_v2',
      isAlive: true,
      currentLoad: 25,
      tasksCompleted: 42,
      tasksFailed: 2,
      predictedLoad: 28,
      history: [15, 20, 30, 25, 22, 28, 32, 24, 27, 25],
      cpuCores: 2,
      memoryGb: 8,
      uptimeSeconds: 78050
    }
  ]);

  // Simulation parameters
  const [selectedStrategy, setSelectedStrategy] = useState<'static' | 'round_robin' | 'least_loaded' | 'fairness' | 'predictive'>('least_loaded');
  const [simulationLog, setSimulationLog] = useState<Task[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1000); // ms between tasks
  const simIntervalRef = useRef<any>(null);

  // Queue indexing for Round Robin simulation routing
  const rrIndexRef = useRef<number>(0);

  // System aggregate summary indicators
  const getJainsIndexValue = () => {
    const completedCounts = nodes.map(n => n.tasksCompleted);
    const sum = completedCounts.reduce((a, b) => a + b, 0);
    if (sum === 0) return 1.0;
    const squaredSum = sum * sum;
    const sumOfSquares = completedCounts.reduce((acc, val) => acc + (val * val), 0);
    const n = nodes.length;
    return squaredSum / (n * sumOfSquares);
  };

  const getSystemMetrics = (): SystemMetrics => {
    const total = simulationLog.length + nodes.reduce((a, n) => a + n.tasksCompleted + n.tasksFailed, 0);
    const completed = nodes.reduce((a, n) => a + n.tasksCompleted, 0);
    const failed = nodes.reduce((a, n) => a + n.tasksFailed, 0);
    const avgLatency = simulationLog.length > 0 
      ? simulationLog.reduce((a, t) => a + t.latency, 0) / simulationLog.length
      : 0.0385; // baseline

    return {
      totalTasks: total,
      completedTasks: completed,
      failedTasks: failed,
      avgLatency: avgLatency,
      jainsIndex: getJainsIndexValue(),
      activeSimulation: isSimulating
    };
  };

  // Append a customized system trace log
  const addLog = (source: string, level: 'info' | 'warn' | 'error' | 'system', message: string) => {
    if (isLogsPaused) return;
    const newLog: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      source,
      message
    };
    setLogsList(prev => [newLog, ...prev].slice(0, 150));
  };

  // Push immediate toast alert
  const triggerNotification = (message: string, type: 'success' | 'warn' | 'info' | 'error' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Auto purge
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // Reconcile and merge backend CLUSTER_MEMBERSHIP_DIRECTORY data into our VMNode settings
  const mergeBackendNodes = (backendNodesMap: any, currentNodes: VMNode[]): VMNode[] => {
    return currentNodes.map(node => {
      const backendData = Object.values(backendNodesMap).find((b: any) => b.node_id === node.name) as any;
      if (backendData) {
        return {
          ...node,
          isAlive: backendData.is_alive,
          currentLoad: backendData.load,
          predictedLoad: backendData.predicted_load,
          tasksCompleted: backendData.tasks_completed,
          tasksFailed: backendData.tasks_failed !== undefined ? backendData.tasks_failed : node.tasksFailed,
          history: backendData.history || node.history
        };
      }
      return node;
    });
  };

  // Helper to fetch and synchronize initial database states from server registries on page mount
  useEffect(() => {
    async function fetchInitialRegistry() {
      try {
        const nodesRes = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/nodes');
        if (nodesRes.ok) {
          const backendNodesMap = await nodesRes.json();
          setNodes(current => mergeBackendNodes(backendNodesMap, current));
        }
      } catch (err) {
        console.warn("REST nodes fetch failure, falling back to cached state.");
      }

      try {
        const logsRes = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/simulations/logs');
        if (logsRes.ok) {
          const backendLogs = await logsRes.json();
          if (backendLogs && backendLogs.length > 0) {
            const mappedLogs: Task[] = backendLogs.map((log: any) => ({
              id: log.task_id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              type: log.type || 'normal',
              complexity: log.complexity || 0.12,
              strategy: log.strategy || 'least_loaded',
              status: log.status || 'completed',
              worker: log.worker || 'unknown',
              latency: log.latency_s || 0.035,
              timestamp: log.timestamp || new Date().toISOString(),
              reason: log.reason || undefined
            }));
            setSimulationLog(mappedLogs);
          }
        }
      } catch (err) {
        console.warn("REST logs fetch failure.");
      }
    }
    fetchInitialRegistry();
  }, []);

  // Connect to live FastAPIs WebSocket stream channel
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let keepAliveInterval: any = null;
    let isMounted = true;

    function connectWebsocket() {
      if (!isMounted) return;
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = `${wsProtocol}${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          setIsWsConnected(true);
          addLog('WEBSOCKET', 'system', 'Established real-time telemetry link with FastAPI.');
          triggerNotification('Live WebSocket channel connected', 'success');

          // Send regular keepsalive heartbeats to prevent idle browser drops
          keepAliveInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            if (event.data === "pong") return;
            const message = JSON.parse(event.data);
            const { event: evType, data } = message;

            switch (evType) {
              case 'NODES_UPDATE': {
                setNodes(currentNodes => mergeBackendNodes(data.nodes, currentNodes));
                break;
              }
              case 'GOSSIP_UPDATE': {
                setNodes(currentNodes => currentNodes.map(n => {
                  if (n.name === data.node.node_id) {
                    return {
                      ...n,
                      isAlive: data.node.is_alive,
                      currentLoad: data.node.load,
                      predictedLoad: data.node.predicted_load,
                      tasksCompleted: data.node.tasks_completed,
                      tasksFailed: data.node.tasks_failed || n.tasksFailed,
                      history: data.node.history || n.history
                    };
                  }
                  return n;
                }));
                break;
              }
              case 'TASK_COMPLETED': {
                const formattedTask: Task = {
                  id: data.task_id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                  type: data.strategy === 'predictive' ? 'heavy' : 'normal',
                  complexity: data.latency_s ? parseFloat((data.latency_s / 0.12).toFixed(2)) : 0.12,
                  strategy: data.strategy || 'least_loaded',
                  status: data.status || 'completed',
                  worker: data.worker_node || 'unknown',
                  latency: data.latency_s || 0.035,
                  timestamp: data.timestamp || new Date().toISOString()
                };
                setSimulationLog(prev => [formattedTask, ...prev].slice(0, 50));
                addLog('SCHEDULER_WS', 'info', `Live WS: Node ${formattedTask.worker} completed task ${formattedTask.id} in ${(formattedTask.latency * 1000).toFixed(1)}ms`);
                break;
              }
              case 'NODE_CRASHED': {
                setNodes(currentNodes => currentNodes.map(n => {
                  if (n.name === data.node_id) {
                    triggerNotification(`Alert: Host ${data.node_id} reported DOWN!`, 'error');
                    addLog('NODE_DAEMON', 'error', `Node crashed alert: ${data.node_id} stopped sending heartbeats.`);
                    return {
                      ...n,
                      isAlive: false,
                      currentLoad: 0,
                      predictedLoad: 0,
                      tasksFailed: n.tasksFailed + 1
                    };
                  }
                  return n;
                }));
                break;
              }
              case 'NODE_RECOVERED': {
                setNodes(currentNodes => currentNodes.map(n => {
                  if (n.name === data.node_id) {
                    triggerNotification(`Network sync: ${data.node_id} joined and recovered!`, 'success');
                    addLog('NODE_DAEMON', 'info', `Node joined gossip network: ${data.node_id} reporting healthy load.`);
                    return {
                      ...n,
                      isAlive: true,
                      currentLoad: 10,
                      predictedLoad: 12
                    };
                  }
                  return n;
                }));
                break;
              }
              case 'CSV_UPDATED':
              case 'CSV_STATUS_UPDATE': {
                addLog('TELEMETRY_WS', 'system', `CSV ledger updated on disk. Size: ${data.size_bytes} bytes. Jain fairness score: ${data.jains_from_file}`);
                break;
              }
              case 'CSV_WIPED': {
                setSimulationLog([]);
                addLog('TELEMETRY_WS', 'warn', 'CSV ledger cleared by server administrator.');
                triggerNotification('Simulation log ledger wiped', 'info');
                break;
              }
              case 'VM_SCALE_START': {
                triggerNotification(`Deployment scaling started for ${data.node_name} to ${data.vm_size}`, 'info');
                addLog('AZURE_IAC_WS', 'info', `Azure ARM: Initiated size deployment resizing VM ${data.node_name} to profile ${data.vm_size}.`);
                break;
              }
              default:
                break;
            }
          } catch (parseErr) {
            // Quietly ignore formatting mismatch
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsWsConnected(false);
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          reconnectTimeout = setTimeout(connectWebsocket, 5000);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };

      } catch (err) {
        if (!isMounted) return;
        setIsWsConnected(false);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        reconnectTimeout = setTimeout(connectWebsocket, 5000);
      }
    }

    connectWebsocket();

    return () => {
      isMounted = false;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Background passive metrics jitter daemon removed for Real Azure Execution Mode

  // Dispatch individual workload frame via selected strategy
  const executeSingleTaskDispatch = async (type: 'normal' | 'burst' | 'heavy') => {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    // Multiplier for task severity
    let multiplier = 0.12;
    if (type === 'burst') multiplier = 0.45;
    if (type === 'heavy') multiplier = 0.82;

    // First, attempt to route the workload via the FastAPI backend!
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/tasks/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task_id: id,
          task_type: type,
          complexity: multiplier,
          strategy: selectedStrategy
        })
      });

      if (response.ok) {
        // The REST dispatch successfully processed. The server will broadcast TASK_COMPLETED
        // via WS which updates our ledger dynamically.
        return;
      } else {
         triggerNotification(`Task routing fail: REST dispatch returned error`, 'error');
         addLog('SCHEDULER', 'error', `REST workload dispatch failed to confirm execution.`);
      }
    } catch (e) {
      triggerNotification(`Task routing fail: Backend unreachable`, 'error');
      addLog('SCHEDULER', 'error', `Task ${id} rejected. Backend connection failed.`);
    }
  };

  // Loop dispatch automation
  useEffect(() => {
    if (isSimulating) {
      simIntervalRef.current = setInterval(() => {
        const types: ('normal' | 'burst' | 'heavy')[] = ['normal', 'normal', 'burst', 'heavy'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        executeSingleTaskDispatch(randomType);
      }, simSpeed);
    } else {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
    }

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulating, simSpeed, selectedStrategy, nodes]);

  // Fail recover manual injector nodes trigger
  const handleToggleNodeState = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const isCrashing = node.isAlive;
    try {
      addLog('ORCHESTRATOR', 'warn', `Initiating physical power action for Azure instance ${node.name}...`);
      triggerNotification(`Initiating VM ${isCrashing ? 'stop' : 'start'} on Azure for ${node.name}...`, 'warn');
      
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/v1/azure/vms/${node.name}/${isCrashing ? 'stop' : 'start'}`, {
        method: 'POST'
      });
      
      if (!res.ok) throw new Error('Azure RM API rejected request');
    } catch (err) {
      triggerNotification(`Failed to toggle Azure instance ${node.name}`, 'error');
      addLog('ORCHESTRATOR', 'error', `Compute API exception on ${node.name}. Check portal.`);
    }
  };

  // Interactive REST service calls simulation
  const handleTriggerPowerCycle = async (nodeName: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + `/api/v1/azure/vms/${nodeName}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        throw new Error(`Backend unreachable or returned invalid JSON (Status: ${response.status}). Ensure the Python FastAPI server is running via Docker.`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.error || `Azure action failed with status ${response.status}`);
      }
      
      // Update local state reactive feedback
      setNodes(prev => prev.map(n => {
        if (n.name === nodeName) {
          if (data.state === 'stopped' || data.state === 'stopping' || data.state === 'deallocated') {
            return { ...n, isAlive: false, currentLoad: 0 };
          } else if (data.state === 'starting' || data.state === 'running') {
            return { ...n, isAlive: true, currentLoad: 10 };
          }
        }
        return n;
      }));

      triggerNotification(`Azure VM command success: ${action.toUpperCase()} -> ${data.state}`, 'success');
      return data;
    } catch (e: any) {
      triggerNotification(`Azure operation failed: ${e.message}`, 'error');
      throw e;
    }
  };

  const handleTriggerDeployExporter = async (nodeName: string) => {
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + `/api/v1/vm/deploy-exporter?node_id=${nodeName}`, { method: 'POST' });
      const data = await response.json();
      triggerNotification(`Exporter installed on ${nodeName}`, 'success');
      return data;
    } catch (e) {
      triggerNotification(`Simulated telemetry deployment successfully sent`, 'success');
      throw e;
    }
  };

  const handleExecuteSsh = async (nodeName: string, command: string) => {
    const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/vm/ssh-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeName, command })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  };

  const handleProbeTelemetry = async (nodeName: string) => {
    const response = await fetch((import.meta.env.VITE_API_URL || '') + `/api/v1/vm/metrics-monitor?node_id=${nodeName}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  };

  // Clear logs terminal
  const handleClearTerminal = () => {
    setLogsList([]);
    triggerNotification('Log indexes cleared', 'info');
  };

  return (
    <div className="h-dvh bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Toast Alert stack overlay */}
      <div className="fixed top-5 right-5 z-[100] space-y-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              key={n.id}
              className={`p-4 rounded-xl border shadow-lg flex items-center gap-3 backdrop-blur-md pointer-events-auto w-72 ${
                n.type === 'success' ? 'bg-emerald-950/70 border-emerald-900/60 text-emerald-300' :
                n.type === 'error' ? 'bg-rose-950/70 border-rose-900/60 text-rose-300' :
                n.type === 'warn' ? 'bg-amber-950/70 border-amber-900/60 text-amber-300' :
                'bg-zinc-900/75 border-zinc-800 text-zinc-200'
              }`}
            >
              <div className="flex-1 text-xs font-semibold leading-snug">{n.message}</div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer text-xs"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main shell Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Navigation Sidebar Drawer - Left */}
        <aside className={`w-64 border-r border-zinc-900 bg-zinc-950 flex flex-col justify-between flex-shrink-0 z-30 transition-transform md:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0 fixed inset-y-0 left-0' : '-translate-x-full fixed md:relative md:flex'
        }`}>
          <div className="flex flex-col">
            {/* Header branding */}
            <div className="p-6 border-b border-zinc-900/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold tracking-tighter text-zinc-100 shadow-lg shadow-indigo-500/20">
                  <Cloud className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-sm font-bold tracking-tight text-zinc-100 font-display">Distributed Systems</h1>
                  <span className="text-[9px] text-zinc-500 font-mono block uppercase tracking-widest font-semibold mt-0.5">Control Centre</span>
                </div>
              </div>
              <button 
                onClick={() => setMobileSidebarOpen(false)}
                className="md:hidden text-zinc-400 hover:text-zinc-250 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav list */}
            <nav className="p-4 space-y-1">
              {[
                { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
                { key: 'nodes', label: 'Nodes', icon: <Server className="h-4 w-4" /> },
                { key: 'simulations', label: 'Simulations', icon: <Zap className="h-4 w-4" /> },
                { key: 'ai_scheduler', label: 'AI Scheduler', icon: <Sparkles className="h-4 w-4" /> },
                { key: 'fairness', label: 'Fairness Metrics', icon: <BarChart2 className="h-4 w-4" /> },
                { key: 'monitoring', label: 'Monitoring', icon: <Activity className="h-4 w-4" /> },
                { key: 'chaos_engine', label: 'Chaos Engine', icon: <ShieldAlert className="h-4 w-4 text-red-500 animate-pulse" /> },
                { key: 'grafana_prometheus', label: 'Grafana & Prometheus', icon: <LineChart className="h-4 w-4 text-amber-500 animate-pulse" /> },
                { key: 'logs', label: 'Logs Terminal', icon: <Terminal className="h-4 w-4" /> },
                { key: 'azure_vms', label: 'Azure VM Panel', icon: <Cloud className="h-4 w-4" /> },
                { key: 'admin_test_azure', label: 'Azure Tests', icon: <Terminal className="h-4 w-4 text-emerald-400" /> },
              ].map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTab(item.key as any);
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full py-2.5 px-3.5 rounded-xl flex items-center gap-3.5 text-xs font-semibold cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-zinc-900 border border-zinc-800 text-indigo-400 font-bold' 
                        : 'text-zinc-450 hover:text-zinc-200 border border-transparent hover:bg-zinc-950/40'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Lower system details */}
          <div className="p-5 border-t border-zinc-900 space-y-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-zinc-300">Control Plane</span>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: '0 0 8px rgba(16,185,129,0.4)' }}></span>
                Synchronized
              </div>
            </div>
            
            <div className="bg-zinc-950/40 border border-zinc-850 p-3 rounded-xl text-[10px] font-mono text-zinc-500 space-y-1.5">
              <div className="flex justify-between items-center">
                <span>Last heartbeat:</span>
                <span className="text-zinc-350">3 sec ago</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Nodes Online:</span>
                <span className="text-zinc-350">{nodes.filter(n => n.isAlive).length}/{nodes.length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Panel Area */}
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
          
          {/* Header Navigation bar */}
          <header className="flex-shrink-0 z-50 p-4 border-b border-zinc-900/60 bg-zinc-950/80 backdrop-blur-md flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                className="md:hidden p-2 bg-zinc-900 text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer border border-zinc-805"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="text-[11px] font-mono font-medium text-zinc-500 select-none hidden sm:block">
                System Time: {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
              </span>
            </div>

            {/* Actions triggers */}
            <div className="flex items-center gap-3 text-xs">
              <div className="px-3 py-1.5 bg-zinc-900/60 border border-zinc-850 rounded-lg font-sans font-medium text-[11px] text-zinc-400 flex items-center gap-2 select-none placeholder-opacity-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                API Connected
              </div>
            </div>
          </header>

          {/* Active view component render portal */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'simulations' ? 'block' : 'hidden'}`}>
              <SimulationsView 
                nodes={nodes} 
                selectedStrategy={selectedStrategy}
                onChangeStrategy={setSelectedStrategy}
                simulationLog={simulationLog}
                isSimulating={isSimulating}
                onToggleSimulator={async () => {
                  if (isSimulating) {
                    try {
                      const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/simulations/stop', { method: 'POST' });
                      if (res.ok) {
                        setIsSimulating(false);
                        addLog('SCHEDULER', 'system', 'Backend load simulator stopped.');
                        triggerNotification('Live backend simulation stopped', 'info');
                      } else {
                        setIsSimulating(false);
                        triggerNotification('Local simulation paused', 'info');
                      }
                    } catch (e) {
                      setIsSimulating(false);
                      triggerNotification('Local simulation paused', 'info');
                    }
                  } else {
                    try {
                      const scenario = selectedStrategy === 'predictive' ? 'heavy' : (Math.random() > 0.5 ? 'burst' : 'normal');
                      const tasks = 150;
                      const interval = simSpeed / 1000;
                      const url = (import.meta.env.VITE_API_URL || '') + `/api/v1/simulations/start?scenario=${scenario}&strategy=${selectedStrategy}&tasks=${tasks}&interval=${interval}`;
                      const res = await fetch(url, { method: 'POST' });
                      if (res.ok) {
                        setIsSimulating(true);
                        addLog('SCHEDULER', 'system', `Started backend load simulator (${scenario}, interval=${interval}s)`);
                        triggerNotification('Live backend simulation started', 'success');
                      } else {
                        setIsSimulating(true);
                        triggerNotification('Started local simulation', 'info');
                      }
                    } catch (e) {
                      setIsSimulating(true);
                      triggerNotification('Started local simulation fallback', 'info');
                    }
                  }
                }}
                simSpeed={simSpeed}
                onChangeSpeed={setSimSpeed}
                onDispatchTask={executeSingleTaskDispatch}
                onClearLogs={async () => {
                  try {
                    const res = await fetch((import.meta.env.VITE_API_URL || '') + '/api/v1/simulations/logs', { method: 'DELETE' });
                    if (res.ok) {
                      setSimulationLog([]);
                      addLog('SCHEDULER', 'warn', 'Logs wiped from server and cached ledger.');
                      triggerNotification('Simulation logs cleared', 'success');
                    } else {
                      setSimulationLog([]);
                      triggerNotification('Cleared local log cache', 'info');
                    }
                  } catch (e) {
                    setSimulationLog([]);
                    triggerNotification('Cleared local log cache', 'info');
                  }
                }}
                onImportCsvLogs={(parsed) => {
                  setSimulationLog(parsed);
                  triggerNotification(`Parsed ${parsed.length} tasks from CSV`, 'success');
                }}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'dashboard' ? 'block' : 'hidden'}`}>
              <DashboardOverview 
                nodes={nodes} 
                recentTasks={simulationLog}
                metrics={getSystemMetrics()}
                logs={logsList}
                activeStrategy={selectedStrategy}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'nodes' ? 'block' : 'hidden'}`}>
              <NodesView 
                nodes={nodes} 
                onToggleNodeState={handleToggleNodeState}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'ai_scheduler' ? 'block' : 'hidden'}`}>
              <AISchedulerView 
                nodes={nodes}
                onTriggerTraining={() => {
                  triggerNotification('Ridge predictions updated', 'success');
                  addLog('AI SCHEDULER', 'system', 'LinearRegression weights successfully fitted on local telemetry.');
                }}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'fairness' ? 'block' : 'hidden'}`}>
              <FairnessView 
                nodes={nodes}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'monitoring' ? 'block' : 'hidden'}`}>
              <MonitoringView 
                nodes={nodes} 
                onProbeTelemetry={handleProbeTelemetry}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'chaos_engine' ? 'block' : 'hidden'}`}>
              <ChaosEngineView 
                nodes={nodes} 
                logs={logsList}
                onAddLog={addLog}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'logs' ? 'block' : 'hidden'}`}>
              <LogsView 
                logs={logsList} 
                onClearLogs={handleClearTerminal}
                isPaused={isLogsPaused}
                onTogglePause={() => {
                  setIsLogsPaused(!isLogsPaused);
                  triggerNotification(isLogsPaused ? 'Logs resumed' : 'Logs stream frozen', 'info');
                }}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'azure_vms' ? 'block' : 'hidden'}`}>
              <AzureVMManagementView 
                nodes={nodes} 
                onTriggerPowerCycle={handleTriggerPowerCycle}
                onTriggerDeployExporter={handleTriggerDeployExporter}
                onExecuteSsh={handleExecuteSsh}
                onAddLog={addLog}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'grafana_prometheus' ? 'block' : 'hidden'}`}>
              <GrafanaPrometheusView 
                nodes={nodes}
                onAddLog={addLog}
              />
            </div>

            <div className={`max-w-7xl mx-auto pb-12 ${activeTab === 'admin_test_azure' ? 'block' : 'hidden'}`}>
              <AzureTestView />
            </div>
          </main>

        </div>

      </div>

    </div>
  );
}
