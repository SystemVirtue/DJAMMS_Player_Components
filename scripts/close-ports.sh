#!/bin/bash
# Close common development ports before starting dev server

echo "🔌 Closing development ports..."

# Kill processes on common dev ports
for port in 3000 5173 8080 5000; do
  PID=$(lsof -ti:$port 2>/dev/null)
  if [ ! -z "$PID" ]; then
    echo "  Closing port $port (PID: $PID)"
    kill -9 $PID 2>/dev/null || true
    sleep 0.5
  else
    echo "  Port $port is free"
  fi
done

# Kill Vite processes
pkill -f "vite" 2>/dev/null && echo "  Killed Vite processes" || echo "  No Vite processes"

# Kill Electron processes
pkill -f "electron" 2>/dev/null && echo "  Killed Electron processes" || echo "  No Electron processes"

echo "✅ Ports closed. Ready to start dev server."

