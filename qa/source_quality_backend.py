"""Loopback QA entrypoint; real auth/role engine, no general research capability."""
import importlib.util
from pathlib import Path

path=Path(__file__).resolve().parents[1]/'api/agent-python.py'
spec=importlib.util.spec_from_file_location('source_ui_backend',path)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def forbidden(*_a,**_k):
    raise RuntimeError('General research is forbidden in source UI QA')


module.get_toolbox=forbidden
module.AutonomousMCPAgent=forbidden
app=module.app
