#!/bin/sh
# User-run entry point when the agent host cannot open SSH connections.
set -eu
workspace=${1:?workspace root required}
frontend_sha=${2:?verified GitHub candidate SHA required}
case "$frontend_sha" in *[!a-f0-9]*|'') echo 'Invalid frontend SHA'; exit 1;; esac
[ "${#frontend_sha}" = 40 ]
cloud="$workspace/LoyoCloud"
package="$workspace/HeySO-hs1-56/deploy/hs1-56"
key="$cloud/.private/deploy_ed25519"
known="$cloud/.private/known_hosts"
archive="$workspace/LoyoCloud-hs1-56/.private/hs1-56-package.tar.gz"
[ -f "$archive" ] && [ -f "$key" ] && [ -f "$known" ]
# Publish the already committed backend source, without touching the user's checkout.
git -C "$cloud" push origin hs1-56-live-data:refs/heads/hs1-56-live-data
release=hs1-56-$(date -u +%Y%m%dT%H%M%SZ)-$$
remote=/tmp/$release
scp -i "$key" -o UserKnownHostsFile="$known" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes "$archive" "root@206.119.166.179:$remote.tar.gz"
ssh -i "$key" -o UserKnownHostsFile="$known" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes root@206.119.166.179 "mkdir '$remote' && tar -xzf '$remote.tar.gz' -C '$remote' && sh '$remote/release-server.sh' '$release' '$remote'"
# Promote the exact tested frontend only after the backend successfully starts.
front="$workspace/HeySO-git"
git -C "$front" fetch origin main hs1-56-live-data
[ "$(git -C "$front" rev-parse origin/hs1-56-live-data)" = "$frontend_sha" ]
git -C "$front" merge-base --is-ancestor origin/main "$frontend_sha"
git -C "$front" push origin "$frontend_sha:refs/heads/main"
echo 'Backend deployed; frontend main published. Netlify deployment and browser acceptance still require verification.'
