#!/bin/bash
# sync-compose-to-s3.sh — uploads docker/ folder to S3 so EC2 can pull it.
# Run this whenever you change docker-compose files.
# Requires: aws cli configured, S3 bucket created, write access to that bucket.

set -euo pipefail

BUCKET="${DEPLOY_S3_BUCKET:-videoplatform-deploy-artifacts-dsk}"
PREFIX="${DEPLOY_S3_PREFIX:-compose}"

if [[ "$BUCKET" == *"PLACEHOLDER"* || "$BUCKET" == *"XXXX"* ]]; then
  echo "ERROR: set DEPLOY_S3_BUCKET env var to your real bucket name" >&2
  echo "  export DEPLOY_S3_BUCKET=videoplatform-deploy-artifacts-dsk" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../docker"

if [ ! -d "$DOCKER_DIR" ]; then
  echo "ERROR: docker dir not found: $DOCKER_DIR" >&2
  exit 1
fi

echo "syncing $DOCKER_DIR -> s3://$BUCKET/$PREFIX/"
aws s3 sync "$DOCKER_DIR" "s3://$BUCKET/$PREFIX/" --delete

echo "done. contents:"
aws s3 ls "s3://$BUCKET/$PREFIX/"
