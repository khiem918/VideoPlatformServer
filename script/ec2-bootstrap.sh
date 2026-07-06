#!/bin/bash
# ec2-bootstrap.sh — run ONCE on a fresh EC2 instance.
# Installs Docker, Docker Compose v2 plugin, jq, AWS CLI v2, and creates /app dirs.
# Assumes the instance has an IAM role with SSM + Secrets Manager + ECR read permissions
# (e.g. EC2-Backend-Role from the CI/CD plan).

set -euo pipefail

echo "==> Updating apt"
sudo apt-get update -y

echo "==> Installing base packages (jq, git, unzip, curl)"
sudo apt-get install -y jq git unzip curl ca-certificates

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  sudo usermod -aG docker "$USER"
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
  sudo /tmp/awsaws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi
aws --version

echo "==> Creating /app directories"
sudo mkdir -p /app/compose
sudo chown -R "$USER":"$USER" /app

echo "==> Bootstrap complete."
echo "Next steps:"
echo "  1. Verify IAM role is attached: aws sts get-caller-identity"
echo "  2. Create the S3 bucket for compose files: videoplatform-deploy-artifacts-PLACEHOLDER"
echo "  3. Set DEPLOY_S3_BUCKET env var on this instance, e.g.:"
echo "       echo 'export DEPLOY_S3_BUCKET=videoplatform-deploy-artifacts-XXXX' | sudo tee /etc/profile.d/deploy.sh"
echo "  4. Run a manual test: /app/deploy.sh api  (or /app/deploy.sh search)"
