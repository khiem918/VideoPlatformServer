#!/bin/bash
# ec2-bootstrap.sh — run ONCE on a fresh EC2 instance.
# Installs Docker, Docker Compose v2 plugin, jq, AWS CLI v2, and creates /app dirs.
# Assumes the instance has an IAM role with SSM + Secrets Manager + ECR read permissions
# (e.g. EC2-Backend-Role from the CI/CD plan).

set -euo pipefail

# When this script is run via `sudo`, $USER becomes root; use SUDO_USER/logname for the real login user.
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo ubuntu)}"

echo "==> Updating apt"
sudo apt-get update -y

echo "==> Installing base packages (jq, git, unzip, curl)"
sudo apt-get install -y jq git unzip curl ca-certificates

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  sudo usermod -aG docker "$REAL_USER"
  echo "Docker installed. You may need to log out and back in for group changes to take effect."
else
  echo "Docker already installed"
fi

echo "==> Installing Docker Compose v2 plugin"
if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi
docker compose version

echo "==> Installing AWS CLI v2"
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi
aws --version

echo "==> Creating /app directories"
sudo mkdir -p /app/compose
sudo chown -R "$REAL_USER":"$REAL_USER" /app

echo "==> Bootstrap complete."
echo "Next steps:"
echo "  1. Verify IAM role is attached: aws sts get-caller-identity"
echo "  2. The S3 bucket for compose files is ready: videoplatform-deploy-artifacts-dsk"
echo "  3. Set DEPLOY_S3_BUCKET env var on this instance by running:"
echo "       echo 'export DEPLOY_S3_BUCKET=videoplatform-deploy-artifacts-dsk' | sudo tee /etc/profile.d/deploy.sh"
