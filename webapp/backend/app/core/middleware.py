import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram

# Core Prom Exporter bindings
API_REQUEST_COUNT = Counter(
    "api_requests_total",
    "Total incoming HTTP API requests.",
    ["method", "endpoint", "status"]
)

API_RESPONSE_LATENCY = Histogram(
    "api_response_seconds",
    "Overall endpoint response durations in seconds.",
    ["endpoint"]
)

class DistributedTelemetryMiddleware(BaseHTTPMiddleware):
    """
    HTTP Middleware collecting instant durations of API traffic and keeping
    Prometheus telemetry counters up to date during validation stress testing.
    """
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Parse route path safely
        endpoint = request.url.path
        method = request.method
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Record telemetry data
            status_code = str(response.status_code)
            API_REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status_code).inc()
            API_RESPONSE_LATENCY.labels(endpoint=endpoint).observe(duration)
            
            # Inject tracking header
            response.headers["X-Response-Time-Seconds"] = f"{duration:.5f}"
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            API_REQUEST_COUNT.labels(method=method, endpoint=endpoint, status="500").inc()
            raise e
