from __future__ import annotations

def test_agent_python_entrypoint_imports():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "api" / "agent-python.py"
    spec = importlib.util.spec_from_file_location("agent_python_runtime", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    assert hasattr(module, "app")
