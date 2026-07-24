#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

action="${1:-start}"

case "$action" in
	start)
		docker compose -p video-platform-api -f "$script_dir/docker-compose.api-service.yml" up -d
		docker compose -p video-platform-search -f "$script_dir/docker-compose.search-service.yml" up -d
		;;
	stop)
		docker compose -p video-platform-api -f "$script_dir/docker-compose.api-service.yml" down -v
		docker compose -p video-platform-search -f "$script_dir/docker-compose.search-service.yml" down -v
		;;
	*)
		echo "Usage: $(basename "$0") {start|stop}" >&2
		exit 1
		;;
esac