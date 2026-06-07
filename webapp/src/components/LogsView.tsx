import { useState } from 'react';
import { 
  Terminal, 
  Trash2, 
  Pause, 
  Play, 
  Download, 
  Search, 
  SlidersHorizontal,
  ChevronRight,
  Filter,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText
} from 'lucide-react';
import { LogEntry } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LogsViewProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

export default function LogsView({
  logs,
  onClearLogs,
  isPaused,
  onTogglePause
}: LogsViewProps) {
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error' | 'system'>('all');
  const [searchText, setSearchText] = useState<string>('');

  // Filtering logic
  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    const matchesSearch = searchText === '' || 
      log.message.toLowerCase().includes(searchText.toLowerCase()) ||
      log.source.toLowerCase().includes(searchText.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  // Export filtered logs as CSV option
  const downloadLogsAsCsv = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Level', 'Source', 'Message'];
    const rows = filteredLogs.map(log => [
      log.timestamp,
      log.level.toUpperCase(),
      log.source,
      log.message
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `distributed_system_trace_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'info':
        return <span className="h-2 w-2 rounded-full bg-blue-500 block"></span>;
      case 'warn':
        return <span className="h-2 w-2 rounded-full bg-amber-500 block"></span>;
      case 'error':
        return <span className="h-2 w-2 rounded-full bg-rose-500 block animate-pulse"></span>;
      case 'system':
        return <span className="h-2 w-2 rounded-full bg-indigo-500 block"></span>;
      default:
        return <span className="h-2 w-2 rounded-full bg-zinc-550 block"></span>;
    }
  };

  const getLogLevelClass = (level: string) => {
    switch (level) {
      case 'info':
        return 'text-blue-400';
      case 'warn':
        return 'text-amber-400';
      case 'error':
        return 'text-rose-455 font-bold';
      case 'system':
        return 'text-indigo-400 font-mediumCode';
      default:
        return 'text-zinc-400';
    }
  };

  return (
    <div className="space-y-6 text-zinc-100" id="logs-view-container">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-zinc-c gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-200">System Log Trace Ledger</h2>
          <p className="text-xs text-zinc-500">Live transaction registries, scheduler events, and peer communication streams.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onTogglePause}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border transition-all ${
              isPaused 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-zinc-950/40 border-zinc-850 hover:bg-zinc-900 text-zinc-400'
            }`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? "Resume Stream" : "Pause Stream"}
          </button>
          
          <button
            onClick={onClearLogs}
            className="px-3 py-1.5 bg-zinc-955 hover:bg-zinc-900 border border-zinc-850 text-zinc-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear logs
          </button>

          <button
            onClick={downloadLogsAsCsv}
            disabled={filteredLogs.length === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
              filteredLogs.length > 0
                ? 'bg-violet-500/10 hover:bg-violet-500/15 border-violet-500/20 text-violet-400 cursor-pointer shadow-sm'
                : 'bg-zinc-950/40 border-zinc-850 text-zinc-650 cursor-not-allowed'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Export Trace CSV
          </button>
        </div>
      </div>

      {/* Control filters bar */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex flex-col sm:flex-row gap-3 justify-between items-center text-xs">
        
        {/* Severity selection */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-500 font-semibold uppercase tracking-wider mr-2 text-[10px] flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Severity
          </span>
          {(['all', 'info', 'warn', 'error', 'system'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={`py-1.5 px-3 rounded-lg border text-[11px] font-bold tracking-wide cursor-pointer transition-colors ${
                filterLevel === level 
                  ? 'bg-zinc-800 border-zinc-700 text-indigo-400 font-extrabold' 
                  : 'bg-zinc-950/40 border-zinc-850/60 text-zinc-500 hover:text-zinc-350'
              }`}
            >
              <span className="capitalize">{level}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search log triggers..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-8.5 pr-4 text-xs font-medium text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <Search className="h-3.5 w-3.5 text-zinc-600 absolute left-3 top-3" />
        </div>
      </div>

      {/* Actual Shell Terminal Log board */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl relative">
        <div className="flex justify-between items-center pb-2.5 border-b border-zinc-850 text-[10px] font-mono text-zinc-555">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-404" />
            <span>SHELL STDOUT LEDGER (TOTAL TRACES: {logs.length})</span>
          </div>
          <span className="text-emerald-400 animate-pulse uppercase font-semibold">
            {isPaused ? '● STALLED' : '● LISTENING'}
          </span>
        </div>

        {/* Output list scroll window */}
        <div className="mt-4 font-mono text-[11px] leading-relaxed space-y-2 h-[350px] overflow-x-hidden overflow-y-auto select-text scrollbar-thin">
          {filteredLogs.map((log, index) => (
            <div key={index} className="flex flex-col lg:flex-row lg:items-start hover:bg-zinc-900/20 py-2 px-2 rounded transition-colors group border-b border-zinc-900/50 last:border-0 gap-1 lg:gap-4">
              <div className="flex items-center gap-3 lg:w-48 flex-shrink-0">
                <span className="text-zinc-600 select-none">
                  [{log.timestamp}]
                </span>
                <div className="flex items-center gap-1.5">
                  {getLogLevelIcon(log.level)}
                  <span className={`uppercase font-bold tracking-wider text-[9px] px-1 bg-zinc-900 min-w-12 text-center rounded ${getLogLevelClass(log.level)}`}>
                    {log.level}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2 min-w-0 w-full lg:flex-1">
                <span className="text-zinc-500 font-sans italic select-none text-[10px] w-24 sm:w-32 flex-shrink-0 mt-0.5">
                  {log.source}:
                </span>
                <span className="text-zinc-350 break-words whitespace-pre-wrap font-mono min-w-0 flex-1 mt-0.5">
                  {log.message}
                </span>
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500 italic text-xs gap-2">
              <FileText className="h-5 w-5 text-zinc-700 animate-pulse" />
              <span>No trace events matched the filters. Try adjusting logs severity.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
