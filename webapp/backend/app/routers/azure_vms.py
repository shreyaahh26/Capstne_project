from fastapi import APIRouter, HTTPException, Depends
from backend.app.services.azure_service import azure_vm_service

router = APIRouter(
    tags=["azure", "vms"],
    responses={404: {"description": "VM Not found"}},
)

@router.get("")
def list_vms():
    res = azure_vm_service.list_all_vms()
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@router.get("/{vm_name}")
def get_vm_status(vm_name: str):
    res = azure_vm_service.get_vm_status(vm_name)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@router.post("/{vm_name}/start")
def start_vm(vm_name: str):
    res = azure_vm_service.start_vm(vm_name)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@router.post("/{vm_name}/stop")
def stop_vm(vm_name: str):
    res = azure_vm_service.stop_vm(vm_name)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@router.post("/{vm_name}/restart")
def restart_vm(vm_name: str):
    res = azure_vm_service.restart_vm(vm_name)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res
