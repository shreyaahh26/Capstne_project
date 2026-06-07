export interface VMNode {
  id: string;
  name: string;
  ip: string;
  port: number;
  region: string;
  size: string;
  isAlive: boolean;
  currentLoad: number;
  tasksCompleted: number;
  tasksFailed: number;
  predictedLoad: number;
  history: number[];
  // Physical parameters
  cpuCores: number;
  memoryGb: number;
  uptimeSeconds: number;
  sku: string;
}

export interface Task {
  id: string;
  type: 'normal' | 'burst' | 'heavy';
  complexity: number;
  strategy: 'static' | 'round_robin' | 'least_loaded' | 'fairness' | 'predictive';
  status: 'pending' | 'completed' | 'failed';
  worker: string;
  timestamp: string;
  latency: number;
  reason?: string;
}

export interface SystemMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgLatency: number;
  jainsIndex: number;
  activeSimulation: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'system';
  source: string;
  message: string;
}

export interface AISchedulerConfig {
  trainingInterval: number;
  confidenceScore: number;
  movingAverageWindow: number;
  featureWeights: {
    timeOfDay: number;
    currentLoad: number;
    localQueueSize: number;
  };
}
