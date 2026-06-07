# PRODUCTION DEPLOYMENT & OBSERVABILITY PLAYBOOK

This comprehensive playbook details the complete architecture, container infrastructure, step-by-step setup guides, cloud integrations, security hardening, and observability setups for the **Distributed Systems & Resource Allocation Dashboard**.

---

## TABLE OF CONTENTS
1. [System Production Architecture](#1-system-production-architecture)
2. [Docker & Container Orchesration](#2-docker--container-orchestration)
3. [Nginx Routing & WebSocket Pipelines](#3-nginx-routing--websocket-pipelines)
4. [Linux Server Bare-metal Setup](#4-linux-server-bare-metal-setup)
5. [Azure Cloud Infrastructure & Automation Setup](#5-azure-cloud-infrastructure--automation-setup)
6. [SSL/TLS and HTTPS Securing Guide](#6-ssltls-and-https-securing-guide)
7. [Prometheus & Grafana Observability Setup](#7-prometheus--grafana-observability-setup)
8. [Enterprise CI/CD Automation Recommendations](#8-enterprise-cicd-automation-recommendations)

---

## 1. SYSTEM PRODUCTION ARCHITECTURE

In production, the application shifts away from developer HMR setups into a highly static, cached, and reverse-proxied multi-tier containerized structure.

```
                  ┌──────────────────────────────────────────────┐
                  │                 Internet Browser             │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         │ HTTPS (Port 443) / SSL
                                         ▼
┌────────────────────────────── SERVER VIRTUAL MACHINE ──────────────────────────────┐
│                                                                                    │
│   ┌────────────────────────────────────────────────────────────────────────────┐   │
│   │                              Nginx Docker Router                           │   │
│   └───────────┬────────────────────────┬──────────────────────────┬────────────┘   │
│               │ /                      │ /api  &  /ws             │ /prometheus    │
│               ▼ Static Assets          ▼ REST / WebSockets        ▼ (Protected API)│
│   ┌───────────────────────┐  ┌───────────────────┐  ┌──────────────────────────┐   │
│   │   Frontend SPA (Vite) │  │  FastAPI Backend  │  │   Prometheus DB Engine ──┼┐  │
│   │   Prebuilt Static     │  │  Multi-threaded   │  │   Scrapes /api/v1/metrics││  │
│   └───────────────────────┘  └─────────┬─────────┘  └──────────────────────────┘│  │
│                                        │                        ▲              │  │
│                                        │ Write CSV              │ Fetch        │  │
│                                        ▼                        │              │  │
│                              ┌───────────────────┐  ┌───────────┴──────────┐   │  │
│                              │ Shared Volume     │  │   Grafana Server     │◀──┘  │
│                              │ simulation.csv    │  │   Port 3000          │      │
│                              └───────────────────┘  └──────────────────────┘      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Pillars:
* **The Single Source of Entry Gateway**: Nginx binds to public ports, shielding raw Node, FastAPI, or DB ports. All requests undergo compression, caching, and SSL termination at this layer.
* **Stateless API Routing & Shared Volume Ledger**: The FastAPI app maintains statelessness for scale, except for appending task entries to the transactional file ledger, which uses a host-attached Docker volume.
* **In-Mesh Active Scraper**: Prometheus queries the `/api/v1/metrics` controller natively. No client-side telemetry pushes are required, avoiding unnecessary security breaches.

---

## 2. DOCKER & CONTAINER ORCHESTRATION

All containers are declared, isolated, and structured inside the `docker-compose.yml` file.

### Spin up the Entire Cluster
To trigger the deployment, download or pull the codebase onto your Linux host machine and run:

```bash
# Pull images and build the full suite from scratch
docker compose build --pull

# Spin up the container services in background detached mode
docker compose up -d

# Verify all services are healthy and running
docker compose ps
```

### Inspect Live Telemetry Logs
To tap into backend, Nginx, or monitoring queues:

```bash
# Print and stream all console logging pipelines
docker compose logs -f

# Read specific FastAPI logs
docker compose logs -f backend
```

---

## 3. NGINX ROUTING & WEBSOCKET PIPELINES

Our `nginx.conf` ensures seamless coordination between HTTP REST endpoints and long-term WebSocket flows.

```nginx
# WebSocket Upgrading Protocol Handshakes
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";

# Extensive timeouts to prevent idle drops during light simulation states
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

---

## 4. LINUX SERVER BARE-METAL SETUP

For hosting on plain Linux hosts (Ubuntu 20.04/22.04 LTS or Debian 11/12):

### Step 1: System Baseline Update & Tool Installs
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git apt-transport-https ca-certificates gnupg lsb-release
```

### Step 2: Install Docker & Docker Compose
```bash
# Add official Docker repository keys
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker daemon
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable and start Docker immediately
sudo systemctl enable docker
sudo systemctl start docker

# Add your current VM operator to the docker execute group
sudo usermod -aG docker $USER
newgrp docker
```

---

## 5. AZURE CLOUD INFRASTRUCTURE & AUTOMATION SETUP

Our scheduler automates Azure compute virtual machine scale-sets or individual host operations using standard Azure Rest management APIs.

### Setup Steps for Azure VM Automation
The FastAPI application authenticates via an **Azure Service Principal** using the Client Credentials Flow.

#### 1. Setup Service Principal via Azure CLI
Run these commands in the Azure Cloud Shell to create a Service Principal and grant it subscription Contributor roles:

```bash
# Sign in if executing locally
az login

# Create Service Principal identity
az ad sp create-for-rbac \
  --name "DistributedSchedulerComputeAutomation" \
  --role "Contributor" \
  --scopes "/subscriptions/ff615065-f3b1-4075-94f7-2393933e9ec2"
```

*Save the returned JSON payload:*
```json
{
  "appId": "3cca09dd-71ae-47c5-83b7-51fb84333316",
  "displayName": "DistributedSchedulerComputeAutomation",
  "password": "YOUR_SUPER_SECRET_CLIENT_PASSWORD_GUID",
  "tenant": "7b41c6d4-c4f7-4866-9ea8-7114764b0f1e"
}
```

#### 2. Configure Environment Secrets
Ensure `.env` contains the required keys matching the above values:
```env
AZURE_TENANT_ID="7b41c6d4-c4f7-4866-9ea8-7114764b0f1e"
AZURE_CLIENT_ID="3cca09dd-71ae-47c5-83b7-51fb84333316"
AZURE_CLIENT_SECRET="YOUR_SUPER_SECRET_CLIENT_PASSWORD_GUID"
AZURE_RESOURCE_GROUP="distributed-system-rg"
AZURE_SUBSCRIPTION_ID="ff615065-f3b1-4075-94f7-2393933e9ec2"
```

---

## 6. SSL/TLS AND HTTPS SECURING GUIDE

To encrypt standard traffic and secure WebSocket operations, use **Certbot** and **Let's Encrypt** certificates on the host machine.

### Step 1: Install Certbot on Host
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Request SSL Certificate
*Temporarily make port 80 accessible to Cerbot's challenge mechanism.*

```bash
# Issue certificates for your domain
sudo certbot certonly --standalone -d scheduler.yourdomain.com -d www.scheduler.yourdomain.com
```

This places production PEM keys inside `/etc/letsencrypt/live/scheduler.yourdomain.com/`.

### Step 3: Map SSL Certificates into Docker Compose & Harden Nginx
Map the certificate files securely into Nginx by modifying the `frontend` service definition:

```yaml
  frontend:
    # ...
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./deployment/nginx_ssl.conf:/etc/nginx/conf.d/default.conf:ro
```

#### SSL Hardened `nginx_ssl.conf` Setup:
```nginx
server {
    listen 80;
    server_name scheduler.yourdomain.com;
    return 301 https://$host$request_uri; # Force redirect to SSL
}

server {
    listen 443 ssl http2;
    server_name scheduler.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/scheduler.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scheduler.yourdomain.com/privkey.pem;

    # Optimal SSL performance settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Gzip & Security headers...
    # (Include location mappings matching nginx.conf...)
}
```

---

## 7. PROMETHEUS & GRAFANA OBSERVABILITY SETUP

Our infrastructure includes automated provisioning, meaning Grafana connects to Prometheus and imports the cluster health dashboards instantly on container initialization!

### Accessing Dashboard Details
* **Prometheus Targets Engine**: accessible directly on `http://<your-server-ip>:9090`
* **Grafana Viz Panels**: available on `http://<your-server-ip>:3000`
  - **Default Username**: `admin`
  - **Default Password**: `admin` *(Will require updating on first sign-on)*
  - **Imported Dashboard Location**: Search catalogs under -> **Dashboards** -> **Distributed Cluster Telemetry Board**

### Setting Up Alerts
To establish Slack/Teams alerts on host failures:
1. Navigate within Grafana to **Alerting** -> **Alert rules**
2. Create standard rule: For query `distributed_node_is_alive == 0`, fire state alert.
3. Configure your webhook under **Contact Points** inside Grafana Settings.

---

## 8. ENTERPRISE CI/CD AUTOMATION RECOMMENDATIONS

Below is a complete, production-ready **GitHub Actions Workflow** blueprint (`.github/workflows/deploy.yml`) to automatically build and deploy new code updates to your servers:

```yaml
name: Production Deployment Pipeline

on:
  push:
    branches: [ "main" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4

      - name: Set up Node.js for Frontend Linting
        uses: actions/setup-node@v4
        with:
          node-size: 20

      - name: Validate Client
        run: |
          npm ci
          npm run lint

      - name: Validate Backend Code style
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Run Backend Lint
        run: |
          cd backend
          pip install flake8
          flake8 . --exclude=venv,env --max-line-length=120

  docker-build-push:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Log in to Docker Registry
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_ACCESS_TOKEN }}

      - name: Build and Push Frontend Image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ${{ secrets.DOCKER_HUB_USERNAME }}/dist-scheduler-frontend:latest

      - name: Build and Push Backend Image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: ${{ secrets.DOCKER_HUB_USERNAME }}/dist-scheduler-backend:latest

  deploy-to-vm:
    needs: docker-build-push
    runs-on: ubuntu-latest
    steps:
      - name: Execute Remote SSH Deploy Script
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.PROD_SERVER_IP }}
          username: ${{ secrets.PROD_SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/distributed-scheduler
            docker compose pull
            docker compose down
            docker compose up -d
            docker image prune -f
            echo "Successfully deployed version ${{ github.sha }} to production!"
```
## CONCLUDING DIAGNOSTIC RUNS

Run the following diagnostics to confirm your server is operating at maximum capacity:

```bash
# Check if proxy ports are listening correctly
sudo netstat -tulpn | grep -E "80|443|3000|9090"

# Monitor live memory profiles of the cluster containers
docker stats
```
