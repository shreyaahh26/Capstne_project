import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const PYTHON_PORT = 9000;

  // Start Python backend
  const pythonProcess = spawn('python3', ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', PYTHON_PORT.toString()], {
    stdio: 'inherit'
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start python process:', err);
  });

  // Proxy to Python Backend
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${PYTHON_PORT}`,
    changeOrigin: true,
    ws: true,
    pathFilter: ['/api', '/vm', '/ws'] // Use filter to preserve path
  });

  app.use(proxy);

  // AI Routes
  app.use(express.json());
  app.post("/ai-api/generate-postmortem", async (req, res) => {
    try {
      const { logs, failedNode, metrics } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a Site Reliability Engineer (SRE). Write a concise, professional Incident Post-Mortem report based on the following telemetry and logs context. Do not include markdown formatting like blockquotes unless it's for code. Use headings and bullet points for readability.

      Incident Context:
      - Failed Node: ${failedNode}
      - Current Metrics: ${JSON.stringify(metrics, null, 2)}
      
      Recent System Logs:
      ${logs.map((l: any) => `[${l.timestamp}] [${l.level}] ${l.system}: ${l.message}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          maxOutputTokens: 150,
          temperature: 0.2
        },
      });

      res.json({ report: response.text });
    } catch (error: any) {
      console.error("Error generating postmortem:", error);
      const errMsg = String(error).toLowerCase();
      if (error && (error.status === 429 || errMsg.includes('quota') || errMsg.includes('429'))) {
         return res.json({ 
           report: `### Automated Incident Post-Mortem (Fallback)\n\n> *Note: The Gemini API quota for this project has been exceeded. Falling back to a synthetic report.*\n\n**Incident Summary:**\nWorker node \`${req.body.failedNode || 'Unknown'}\` experienced an abrupt termination. The Chaos Engine injected a simulated fault which was successfully detected by the gossip network.\n\n**Action Items:**\n- [x] Node isolated from scheduler queue\n- [ ] Auto-remediation script deployment\n- [ ] Monitor global fairness index for re-balancing`
          });
      }
      res.status(500).json({ error: "Failed to generate post-mortem." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
