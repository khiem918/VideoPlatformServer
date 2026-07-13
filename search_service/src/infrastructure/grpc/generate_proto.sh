#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
proto_root="$(realpath "${script_dir}/../../../../proto")"
output_dir="${script_dir}/generated"

if [ -d "${output_dir}" ]; then
  rm -rf "${output_dir}"
fi

mkdir -p "${output_dir}"

python -m grpc_tools.protoc \
  -I "${proto_root}" \
  --python_out="${output_dir}" \
  --grpc_python_out="${output_dir}" \
  "${proto_root}"/*.proto

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' 's/^import \(.*_pb2\) as \(.*\)$/from . import \1 as \2/' "${output_dir}"/*_pb2_grpc.py
else
  sed -i 's/^import \(.*_pb2\) as \(.*\)$/from . import \1 as \2/' "${output_dir}"/*_pb2_grpc.py
fi

echo "Compiled gRPC successfully"








