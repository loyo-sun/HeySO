#!/bin/sh
set -eu
release=${1:?release required}
package=${2:?package directory required}
case "$release" in *[!a-zA-Z0-9._-]*|'') exit 1;; esac
export PATH=/opt/node/bin:$PATH
exec 9>/var/lock/loyocloud-release.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
previous=$(readlink -f /opt/loyocloud/current)
destination=/opt/loyocloud/releases/$release
[ -d "$previous" ] && [ ! -e "$destination" ]
node --input-type=module - "$previous" "$package" <<'JS'
import fs from 'node:fs';import crypto from 'node:crypto';
const [root,pack]=process.argv.slice(2),manifest=JSON.parse(fs.readFileSync(pack+'/manifest.json'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [file,record]of Object.entries(manifest.files)){
 const runtime=!file.startsWith('tests/')&&!file.startsWith('docs/');
 if(runtime&&record.base&&sha(root+'/'+file)!==record.base)throw Error('Production baseline differs: '+file);
 if(runtime&&!record.base&&fs.existsSync(root+'/'+file)&&sha(root+'/'+file)!==record.next)throw Error('Unexpected production file: '+file);
 if(sha(pack+'/overlay/'+file)!==record.next)throw Error('Package checksum mismatch: '+file);
}
for(const [file,hash]of Object.entries(manifest.dependencies))if(sha(root+'/'+file)!==hash)throw Error('Domain dependency differs: '+file);
JS
/usr/local/sbin/loyocloud-backup
mkdir "$destination"
cp -a "$previous/." "$destination/"
cp -a "$package/overlay/." "$destination/"
cp "$package/manifest.json" "$destination/hs1-56-origin-release.json"
cd "$destination"
# Run the real PostgreSQL-compatible contracts without touching production data.
# PGlite is a pinned existing development dependency, used only for verification.
npm ci --include=dev --no-audit --no-fund
node --test --test-concurrency=1 tests/heyso-live-origin.test.mjs tests/heyso-live.test.mjs tests/heyso-domain.test.mjs tests/closed-sprint-domain.test.mjs tests/mcp-contracts.test.mjs tests/hs1-35-domain.test.mjs tests/hs1-36-domain.test.mjs
node --input-type=module -e "await import('./src/server.mjs')"
npm prune --omit=dev --no-audit --no-fund
chown -R root:loyocloud "$destination"
switched=0
rollback(){
 result=$?
 if [ "$result" -ne 0 ] && [ "$switched" = 1 ]; then
  ln -s "$previous" "/opt/loyocloud/.rollback-$release"
  mv -Tf "/opt/loyocloud/.rollback-$release" /opt/loyocloud/current
  systemctl restart loyocloud
  echo 'Release failed; previous code restored. Additive schema and current data retained.' >&2
 fi
}
trap rollback EXIT
ln -s "$destination" "/opt/loyocloud/.next-$release"
mv -Tf "/opt/loyocloud/.next-$release" /opt/loyocloud/current
switched=1
systemctl restart loyocloud
healthy=0
for attempt in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:4320/healthz | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).ok?0:1)}catch{process.exit(1)}})'; then healthy=1; break; fi
 sleep 1
done
[ "$healthy" = 1 ]
systemctl is-active loyocloud
echo "Published HS1-56 origin route fix; previous release retained: $previous"
