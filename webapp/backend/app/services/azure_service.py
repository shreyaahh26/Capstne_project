import logging
import os
from typing import Dict, List, Optional
from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.core.exceptions import AzureError
from backend.app.core.config import settings

# Setup logging to a specific file
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
azure_logger = logging.getLogger("azure_service")
azure_logger.setLevel(logging.INFO)
file_handler = logging.FileHandler(os.path.join(log_dir, "azure.log"))
formatter = logging.Formatter('%(asctime)s - %(levelname)s - User Action: %(message)s')
file_handler.setFormatter(formatter)
if not azure_logger.handlers:
    azure_logger.addHandler(file_handler)

class AzureVMService:
    def __init__(self):
        self.tenant_id = settings.get_azure_tenant_id().strip()
        self.client_id = settings.get_azure_client_id().strip()
        self.client_secret = (settings.get_azure_client_secret() or "").strip()
        
        self.subscription_id = settings.get_azure_subscription_id().strip()
            
        self.resource_group = settings.get_azure_resource_group().strip()

    def _get_client(self) -> ComputeManagementClient:
        credential = ClientSecretCredential(
            tenant_id=self.tenant_id,
            client_id=self.client_id,
            client_secret=self.client_secret
        )
        return ComputeManagementClient(credential, self.subscription_id)

    def _get_rg_for_vm(self, client: ComputeManagementClient, vm_name: str) -> str:
        # Tries default first
        try:
            client.virtual_machines.get(self.resource_group, vm_name)
            return self.resource_group
        except Exception:
            pass
        
        # Scan all if default failed
        import re
        for vm in client.virtual_machines.list_all():
            if vm.name == vm_name:
                match = re.search(r'/resourceGroups/([^/]+)/', vm.id, re.IGNORECASE)
                if match:
                    return match.group(1)
        return self.resource_group # Fallback

    def get_vm_status(self, vm_name: str) -> Dict:
        try:
            client = self._get_client()
            rg_name = self._get_rg_for_vm(client, vm_name)
            instance = client.virtual_machines.instance_view(rg_name, vm_name)
            statuses = [status.display_status for status in instance.statuses]
            power_state = next((s for s in statuses if s and "PowerState" in s or "running" in s.lower() or "stopped" in s.lower() or "deallocated" in s.lower()), "unknown")
            
            # Formatting power_state appropriately
            if not power_state:
                p_state = "unknown"
            elif "running" in power_state.lower():
                p_state = "running"
            elif "deallocated" in power_state.lower() or "stopped" in power_state.lower():
                p_state = "stopped"
            elif "starting" in power_state.lower():
                p_state = "starting"
            elif "stopping" in power_state.lower():
                p_state = "stopping"
            else:
                p_state = power_state
            
            azure_logger.info(f"get_vm_status - vm: {vm_name} - state: {p_state}")
            return {"success": True, "vm": vm_name, "state": p_state, "raw_statuses": statuses}
        except AzureError as e:
            azure_logger.error(f"get_vm_status error - vm: {vm_name} - {str(e)}")
            return {"success": False, "vm": vm_name, "error": str(e)}

    def start_vm(self, vm_name: str) -> Dict:
        try:
            client = self._get_client()
            rg_name = self._get_rg_for_vm(client, vm_name)
            poller = client.virtual_machines.begin_start(rg_name, vm_name)
            poller.result()  # Wait for completion
            azure_logger.info(f"start_vm - vm: {vm_name} - response: success")
            return {"success": True, "vm": vm_name, "state": "running"}
        except AzureError as e:
            azure_logger.error(f"start_vm error - vm: {vm_name} - {str(e)}")
            return {"success": False, "vm": vm_name, "error": str(e)}

    def stop_vm(self, vm_name: str) -> Dict:
        try:
            client = self._get_client()
            rg_name = self._get_rg_for_vm(client, vm_name)
            poller = client.virtual_machines.begin_deallocate(rg_name, vm_name)
            poller.result()  # Wait for completion
            azure_logger.info(f"stop_vm - vm: {vm_name} - response: success")
            return {"success": True, "vm": vm_name, "state": "stopped"}
        except AzureError as e:
            azure_logger.error(f"stop_vm error - vm: {vm_name} - {str(e)}")
            return {"success": False, "vm": vm_name, "error": str(e)}

    def restart_vm(self, vm_name: str) -> Dict:
        try:
            client = self._get_client()
            rg_name = self._get_rg_for_vm(client, vm_name)
            poller = client.virtual_machines.begin_restart(rg_name, vm_name)
            poller.result()  # Wait for completion
            azure_logger.info(f"restart_vm - vm: {vm_name} - response: success")
            return {"success": True, "vm": vm_name, "state": "running"}
        except AzureError as e:
            azure_logger.error(f"restart_vm error - vm: {vm_name} - {str(e)}")
            return {"success": False, "vm": vm_name, "error": str(e)}

    def list_all_vms(self) -> Dict:
        try:
            client = self._get_client()
            vms = client.virtual_machines.list_all()
            vm_list = []
            for vm in vms:
                # Extract resource group from Azure ID
                import re
                rg_name = self.resource_group
                match = re.search(r'/resourceGroups/([^/]+)/', vm.id, re.IGNORECASE)
                if match:
                    rg_name = match.group(1)

                # get status bypassing the local resourceGroup
                try:
                    instance = client.virtual_machines.instance_view(rg_name, vm.name)
                    statuses = [status.display_status for status in instance.statuses]
                    power_state = next((s for s in statuses if s and ("PowerState" in s or "running" in s.lower() or "stopped" in s.lower() or "deallocated" in s.lower())), "unknown")
                except Exception:
                    power_state = "unknown"

                if not power_state:
                    p_state = "unknown"
                elif "running" in power_state.lower():
                    p_state = "running"
                elif "deallocated" in power_state.lower() or "stopped" in power_state.lower():
                    p_state = "stopped"
                elif "starting" in power_state.lower():
                    p_state = "starting"
                elif "stopping" in power_state.lower():
                    p_state = "stopping"
                else:
                    p_state = power_state

                vm_list.append({
                    "name": vm.name,
                    "id": vm.id,
                    "location": vm.location,
                    "size": vm.hardware_profile.vm_size if vm.hardware_profile else "Unknown",
                    "state": p_state
                })
            azure_logger.info("list_all_vms - request: success")
            return {"success": True, "vms": vm_list}
        except AzureError as e:
            import traceback
            error_details = str(e)
            if hasattr(e, "response") and e.response:
                try:
                    error_details += " | Response: " + e.response.text()
                except Exception:
                    pass
            trace_str = traceback.format_exc()
            with open('/tmp/azure_error.txt', 'w') as f:
                f.write(error_details + "\n" + trace_str)
            azure_logger.error(f"list_all_vms error - {error_details}")
            return {"success": False, "error": error_details}

azure_vm_service = AzureVMService()
