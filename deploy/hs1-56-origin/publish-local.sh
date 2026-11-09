#!/bin/sh
set -eu
workspace=${1:?workspace required}
cloud="$workspace/LoyoCloud"
key="$cloud/.private/deploy_ed25519"
known="$cloud/.private/known_hosts"
archive="$workspace/LoyoCloud-hs1-56/.private/hs1-56-origin-package.tar.gz"
[ -f "$archive" ] && [ -f "$key" ] && [ -f "$known" ]
git -C "$cloud" push origin hs1-56-live-data:refs/heads/hs1-56-live-data
release=hs1-56-origin-$(date -u +%Y%m%dT%H%M%SZ)-$$
remote=/tmp/$release
scp -i "$key" -o UserKnownHostsFile="$known" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes "$archive" "root@206.119.166.179:$remote.tar.gz"
ssh -i "$key" -o UserKnownHostsFile="$known" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes root@206.119.166.179 "mkdir '$remote' && tar -xzf '$remote.tar.gz' -C '$remote' && sh '$remote/release-server.sh' '$release' '$remote'"
echo 'Origin route fix deployed. The existing frontend will reconnect automatically; browser verification remains.'
