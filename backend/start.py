#!/usr/bin/env python3
"""
AyuScout V2 — Smart Backend Launcher
=====================================
Replaces: python server.py

What this script does:
  1. Reads BACKEND_PORT from .env (defaults to 8080)
  2. Checks if the port is already in use
  3. If occupied: kills the zombie Python/uvicorn process (Windows + Unix)
  4. Falls back to 8081 → 8082 → 8083 → 8000 if all kill attempts fail
  5. Launches server.py cleanly with the resolved port
  6. Writes the active port to .active_port for the frontend sync script

Usage:
    cd backend
    python start.py
"""
import os
import sys
import socket
import subprocess
import time
import pathlib
import signal

# ── Load .env ────────────────────────────────────────────────
_root = pathlib.Path(__file__).parent
_env  = _root / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

# ── Port config ───────────────────────────────────────────────
PREFERRED_PORT = int(os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8080)))
FALLBACK_PORTS = [PREFERRED_PORT, 8081, 8082, 8083, 8000]


def port_in_use(port: int) -> bool:
    """Check if a TCP port is currently bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
            return False
        except OSError:
            return True


def kill_pid_on_port(port: int) -> bool:
    """
    Kill whichever process is listening on `port`.
    Works on Windows (netstat + taskkill) and Unix (lsof + kill).
    Returns True if a process was successfully killed.
    """
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(
                f"netstat -ano | findstr :{port}",
                shell=True, stderr=subprocess.DEVNULL
            ).decode(errors="replace")
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and f":{port}" in parts[1] and parts[3] == "LISTENING":
                    pid = int(parts[4])
                    subprocess.call(
                        f"taskkill /F /PID {pid}",
                        shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                    )
                    print(f"   [PORT-MGR] 🔪 Killed PID={pid} on :{port}")
                    return True
        except Exception:
            pass
    else:
        # Unix / macOS
        try:
            out = subprocess.check_output(
                ["lsof", "-ti", f"tcp:{port}"], stderr=subprocess.DEVNULL
            ).decode().strip()
            for pid_str in out.splitlines():
                try:
                    os.kill(int(pid_str), signal.SIGKILL)
                    print(f"   [PORT-MGR] 🔪 Killed PID={pid_str} on :{port}")
                    return True
                except Exception:
                    pass
        except Exception:
            pass
    return False


def find_free_port() -> int:
    """
    Iterate over candidate ports.
    For each occupied port: kill zombie → wait 1 s → re-check → move on.
    """
    sep = "─" * 58
    print(f"\n{sep}")
    print("  AyuScout V2 — Port Manager")
    print(sep)

    for port in FALLBACK_PORTS:
        if not port_in_use(port):
            print(f"   [PORT-MGR] ✅ Port {port} is free")
            return port

        print(f"   [PORT-MGR] Port {port} is occupied — trying to free it …")
        killed = kill_pid_on_port(port)
        if killed:
            time.sleep(1.2)       # Windows needs ~1 s for socket teardown
            if not port_in_use(port):
                print(f"   [PORT-MGR] ✅ Port {port} freed successfully")
                return port
        print(f"   [PORT-MGR] ⚠️  Port {port} still busy — trying next port")

    raise RuntimeError(
        f"All candidate ports are occupied: {FALLBACK_PORTS}\n"
        "  → Manually close Python/Node/uvicorn processes and retry."
    )


def main():
    try:
        active_port = find_free_port()
    except RuntimeError as e:
        print(f"\n❌  {e}\n")
        sys.exit(1)

    if active_port != PREFERRED_PORT:
        print(f"\n   ⚠️  Preferred port {PREFERRED_PORT} busy → running on {active_port}")
        print(f"   💡 Set BACKEND_PORT={active_port} in backend/.env to prefer this port.\n")

    # Write active port for frontend sync
    (_root / ".active_port").write_text(str(active_port))

    print(f"\n{'═'*58}")
    print(f"   ✅ Backend  → http://localhost:{active_port}")
    print(f"   ✅ API Docs → http://localhost:{active_port}/docs")
    print(f"   ✅ Frontend → http://localhost:5173  (run: npm run dev)")
    print(f"{'═'*58}\n")

    # Set the port for server.py to pick up
    os.environ["BACKEND_PORT"] = str(active_port)
    os.environ["PORT"] = str(active_port)

    # Hand off to uvicorn directly (avoids double-spawn on Windows)
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=active_port,
        reload=False,          # CRITICAL: reload=True causes WinError 10048 via multiprocessing
        log_level="info",
    )


if __name__ == "__main__":
    main()
