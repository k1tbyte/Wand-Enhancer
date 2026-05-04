#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
script_path="$script_dir/build.ps1"

if command -v cygpath >/dev/null 2>&1; then
	script_path="$(cygpath -w "$script_path")"
fi

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$script_path" "$@"
