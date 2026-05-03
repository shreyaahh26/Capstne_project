from locust import HttpUser, task, between
import random
import uuid


class IoTSensorUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(3)
    def normal_sensor_data(self):
        self.client.post("/dispatch", json={
            "task_id": f"normal-{uuid.uuid4()}",
            "task_type": "normal",
            "complexity": round(random.uniform(0.1, 0.3), 2),
            "strategy": "round_robin"
        })

    @task(1)
    def burst_sensor_data(self):
        self.client.post("/dispatch", json={
            "task_id": f"burst-{uuid.uuid4()}",
            "task_type": "burst",
            "complexity": round(random.uniform(0.4, 0.8), 2),
            "strategy": "least_loaded"
        })