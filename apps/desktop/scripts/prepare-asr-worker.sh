#!/bin/bash
set -e

# Get the directory of the script and resolve the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../../.." && pwd )"

echo "=== Preparing ASR Worker environment ==="
echo "Project root: $PROJECT_ROOT"

# Navigate to workers/asr
cd "$PROJECT_ROOT/workers/asr"

# Check if uv is installed
if ! command -v uv &> /dev/null; then
  echo "Error: 'uv' is not installed or not in PATH."
  exit 1
fi

echo "Running uv sync..."
uv sync

# Verify that .venv/bin/python exists
if [ ! -f ".venv/bin/python" ]; then
  echo "Error: .venv/bin/python does not exist after uv sync."
  exit 1
fi

echo "ASR Worker environment is ready!"
