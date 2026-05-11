#!/usr/bin/env bash
set -euo pipefail

# : "${ISSUE_ID:?ISSUE_ID is required}"
# : "${DEPLOY_NAMESPACE:?DEPLOY_NAMESPACE is required}"

DEPLOY_NAMESPACE=$1
echo "Deploying issue ${ISSUE_ID} to namespace ${DEPLOY_NAMESPACE}"

# Replace this with your real deployment command.
# Examples:
# kubectl -n "$DEPLOY_NAMESPACE" apply -f k8s/
# pnpm deploy --namespace "$DEPLOY_NAMESPACE" --issue "$ISSUE_ID"
# ./scripts/deploy.sh "$DEPLOY_NAMESPACE"

# echo "TODO: implement real deployment command"
NAMESPACE=$(jq -r '.deploy_namespace' ../config.json)
cd ../../../../scripts
./redeploy.sh -b -n $DEPLOY_NAMESPACE