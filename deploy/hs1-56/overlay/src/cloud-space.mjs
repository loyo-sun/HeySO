import {applicationUser} from './identity.mjs';
import { applications } from './app-registry.mjs';
import { applicationSummary } from './app-connections.mjs';
import {allowsEditorOrigin} from './editor-origins.mjs';
import {registerConnection} from './app-connections.mjs';
import {
  compactVersion,
  hydrateVersion,
  storageUsage,
} from "./shared-snapshots.mjs";
import {
  installRollingVersions,
  effectiveVersion,
  collectSharedGarbage,
} from "./rolling-versions.mjs";
import { editLocks, assertFileUnlocked } from "./edit-locks.mjs";
import { readFileSync } from "node:fs";
import { installCloudDriveActions } from "./cloud-drive-actions.mjs";
import { archiveCloudFiles } from "./cloud-archive.mjs";
import {
  installCloudFolders,
  purgeExpiredCloudTrash,
  touchCloudFolders,
} from "./cloud-folders.mjs";
import { transaction, audit } from "./db.mjs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { html, getSecret } from "./security.mjs";
export function installCloudSpace(
  app,
  { db, login, csrf, render, locks = editLocks(db), origins },
) {
  const error = (status, message) => Object.assign(Error(message), { status });
  const owner = async (req, res, next) => {
    if (req.headers.authorization) {
      const s = await getSecret(
        db,
        req.headers.authorization.replace(/^Bearer /, ""),
        "editor",
      );
      if (
        !s ||
        (origins && !allowsEditorOrigin(origins, s.data.app, req.headers.origin)) ||
        s.data.origin !== req.headers.origin ||
        !applications[s.data.app]
      )
        throw error(401, "登录已失效");
      req.user = { id: s.user_id };
      req.editorSession = s;
      if (req.params.id) {
        const existing = (await db.query('SELECT app FROM cloud_documents WHERE id::text=$1 AND user_id=$2',[req.params.id,s.user_id])).rows[0];
        if (existing && existing.app !== s.data.app) throw error(404,'文件不属于当前应用');
        if(req.method !== 'GET' && req.path.includes('/folders/')) {
          const foreign=await db.query(`WITH RECURSIVE tree AS (SELECT id FROM cloud_folders WHERE id::text=$1 AND user_id=$2 UNION ALL SELECT f.id FROM cloud_folders f JOIN tree t ON f.parent_id=t.id WHERE f.user_id=$2) SELECT d.id FROM cloud_documents d WHERE d.folder_id IN (SELECT id FROM tree) AND d.user_id=$2 AND d.app<>$3 LIMIT 1`,[req.params.id,s.user_id,s.data.app]);
          if(foreign.rows.length) throw error(403,'此文件夹包含其他应用文件，请在云空间中管理');
        }

      }
      return next();
    }
    return login(req, res, next);
  };
  const write = (req, res, next) =>
    req.headers.authorization ? next() : csrf(req, res, next);
  const folder = async (user, id) => {
    if (
      id &&
      !(
        await db.query(
          "SELECT id FROM cloud_folders WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
          [id, user],
        )
      ).rows.length
    )
      throw error(404, "文件夹不存在");
  };
  const document = async (user, id) => {
    const row = (
      await db.query(
        "SELECT * FROM cloud_documents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
        [id, user],
      )
    ).rows[0];
    if (!row) throw error(404, "文件不存在");
    return row;
  };
  const identity = (req) => ({
    userId: req.user.id,
    documentId: req.params.id,
    editorId: req.body.editorId,
    token: req.body.lockToken,
    sessionHash: req.editorSession?.hash,
  });
  const canvasOwner = async(req,res,next) => owner(req,res,async()=>{
    const target=(await db.query('SELECT app FROM cloud_documents WHERE id::text=$1 AND user_id=$2',[req.params.id,req.user.id])).rows[0];
    if(req.editorSession?.data.app==='heyso'||target?.app==='heyso')throw error(400,'HeySO 项目不使用画布草稿接口');
    return next();
  });
  installRollingVersions(app, { db, owner:canvasOwner, write, locks, identity, folder });
  app.get("/api/v1/space/files/:id/edit", owner, async (req, res) =>
    res.json({ lock: await locks.status(req.user.id, req.params.id) }),
  );
  for (const action of ["acquire", "renew", "release", "validate"])
    app.post(
      "/api/v1/space/files/:id/edit/" + action,
      owner,
      write,
      async (req, res) => {
        if (
          !req.editorSession ||
          typeof req.body.editorId !== "string" ||
          !req.body.editorId ||
          req.body.editorId.length > 200
        )
          throw error(400, "请通过编辑器获取编辑权");
        const id = identity(req);
        if (action === "acquire") {
          const resume = req.body.resume;
          if (
            resume &&
            (req.headers.origin === "baizefig://app" ||
              typeof resume.editorId !== "string" ||
              !resume.editorId ||
              resume.editorId.length > 200 ||
              typeof resume.token !== "string" ||
              !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
                resume.token,
              ))
          )
            throw error(400, "无效的编辑会话接续凭证");
          const existing = (
            await db.query(
              "SELECT user_id FROM cloud_documents WHERE id::text=$1",
              [req.params.id],
            )
          ).rows[0];
          if (existing && existing.user_id !== req.user.id)
            throw error(404, "文件不存在");
          const connection=await registerConnection(db,{userId:req.user.id,editorId:id.editorId,sessionHash:id.sessionHash,origin:req.headers.origin,app:req.editorSession.data.app,name:String(req.body.label||applications[req.editorSession.data.app].name).slice(0,100)+" · "+id.editorId.slice(0,6),platform:req.body.platform==="desktop"?"本地版":"网页版",documentId:req.params.id},'file_accessed');
          if(!connection) throw error(403,"此连接已停用，请退出编辑器账号后重新登录");
          res.json(
            await locks.acquire({
              ...id,
              resume: resume || null,
              label:
                "用户 · " + String(req.body.label || "BaizeFig").slice(0, 80),
            }),
          );
        } else if (action === "validate") {
          await transaction(db, (c) => locks.verify(id, c));
          res.json({ ok: true });
        } else if (action === "renew") res.json(await locks.renew(id));
        else {
          await locks.release(id);
          res.json({ ok: true });
        }
      },
    );
  app.get("/api/v1/space", owner, async (req, res) =>
    res.json({
      applications: (await applicationSummary(db,req.user.id)).filter(a=>!req.editorSession||(a.id===req.editorSession.data.app&&a.origin===req.editorSession.data.origin)),
      storage: {
        limit_bytes: (
          await db.query("SELECT storage_limit_bytes FROM users WHERE id=$1", [
            req.user.id,
          ])
        ).rows[0].storage_limit_bytes,
        used_bytes: (await storageUsage(db, req.user.id)).logicalBytes,
      },
      user: applicationUser((
        await db.query("SELECT id,username,name,avatar FROM users WHERE id=$1", [
          req.user.id,
        ])
      ).rows[0]),
      folders: (
        await db.query(
          "SELECT f.*,(SELECT COALESCE(NULLIF(name,''),username) FROM users WHERE id=f.user_id) AS owner FROM cloud_folders f WHERE user_id=$1 AND deleted_at IS NULL ORDER BY name",
          [req.user.id],
        )
      ).rows,
      files: (
        await db.query(
          `SELECT d.*,(SELECT COALESCE(NULLIF(name,''),username) FROM users WHERE id=d.user_id) AS owner, COALESCE((SELECT logical_bytes FROM cloud_rolling_drafts WHERE document_id=d.id),(SELECT COALESCE(v.logical_bytes,octet_length(v.content::text)) FROM cloud_document_versions v WHERE v.document_id=d.id AND v.id=d.head_id)) AS size_bytes FROM cloud_documents d WHERE user_id=$1 AND deleted_at IS NULL ORDER BY name`,
          [req.user.id],
        )
      ).rows.filter(f => !req.editorSession || f.app === req.editorSession.data.app),
    }),
  );
  app.post("/api/v1/space/folders", owner, write, async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 120) throw error(400, "名称长度须为 1–120");
    await folder(req.user.id, req.body.parentId);
    const id = randomUUID();
    await db.query(
      "INSERT INTO cloud_folders(id,user_id,parent_id,name) VALUES($1,$2,$3,$4)",
      [id, req.user.id, req.body.parentId || null, name],
    );
    res.json({ id });
  });
  app.post("/api/v1/space/files/:id/save", owner, write, async (req, res) => {
    if (!req.headers.authorization) throw error(403, "请通过 BaizeFig 编辑");
    const content = req.body.content;
    if (req.editorSession.data.app !== "baizefig") throw error(403,"请通过 HeySO 项目接口保存");
    if (
      !content ||
      content.id !== req.params.id ||
      !Array.isArray(content.pages) ||
      !content.pages.length ||
      !Array.isArray(content.nodes) ||
      typeof content.name !== "string"
    )
      throw error(400, "无效的 .baizefig 文件");
    if (
      req.body.preview &&
      (!Array.isArray(req.body.preview) ||
        req.body.preview.some(
          (p) =>
            typeof p !== "string" ||
            !/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(p),
        ))
    )
      throw error(400, "预览格式无效");
    // Web editors opt in; existing desktop clients keep append-only manual saves.
    const automatic =
      req.body.saveMode === "autosave" &&
      req.headers.origin !== "baizefig://app";
    const hasFolder = Object.hasOwn(req.body, "folderId");
    if (hasFolder) await folder(req.user.id, req.body.folderId);
    const version = await transaction(db, async (c) => {
      const account = (
        await c.query(
          "SELECT storage_limit_bytes FROM users WHERE id=$1 FOR UPDATE",
          [req.user.id],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO cloud_documents(id,user_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
        [req.params.id, req.user.id, content.name.slice(0, 120)],
      );
      if (
        !(
          await c.query(
            "SELECT id FROM cloud_documents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
            [req.params.id, req.user.id],
          )
        ).rows.length
      )
        throw error(404, "文件不存在");
      await locks.verify(identity(req), c);
      const previous = (
        await c.query(
          `SELECT v.*,d.name AS file_name,d.folder_id FROM cloud_documents d LEFT JOIN cloud_document_versions v ON v.id=d.head_id AND v.document_id=d.id WHERE d.id=$1 AND d.user_id=$2`,
          [req.params.id, req.user.id],
        )
      ).rows[0];
      const sameHead = previous?.id === (req.body.headId || null);
      if (
        automatic &&
        sameHead &&
        previous.file_name === content.name &&
        (!hasFolder || previous.folder_id === (req.body.folderId || null))
      ) {
        const prior = await hydrateVersion(c, previous, req.user.id);
        const equal = isDeepStrictEqual(prior.content, content);
        if (equal)
          return { headId: previous.id, coalesced: false, unchanged: true };
      }
      let coalesced =
        automatic &&
        sameHead &&
        previous.autosave_lock_token === req.body.lockToken &&
        !previous.version_name;
      const version = randomUUID();
      // Optimistic head comparison prevents silent overwrites from another editor.
      const updated = await c.query(
        "UPDATE cloud_documents SET name=$3,updated_at=now(),head_id=$4,folder_id=CASE WHEN $6 THEN $7::uuid ELSE folder_id END WHERE id=$1 AND user_id=$2 AND head_id IS NOT DISTINCT FROM $5 RETURNING id",
        [
          req.params.id,
          req.user.id,
          content.name.slice(0, 120),
          version,
          req.body.headId || null,
          hasFolder,
          req.body.folderId || null,
        ],
      );
      if (!updated.rows.length)
        throw error(409, "云端版本已变化，请重新打开后保存");
      if (coalesced) {
        // Only the current, unnamed automatic snapshot of this live edit lease is mutable.
        // Rotate its ID as well as the head so stale requests still fail version comparison.
        const replaced = await c.query(
          "UPDATE cloud_document_versions SET id=$2,content=$3,preview=$4,snapshot_hash=NULL,logical_bytes=NULL,preview_bytes=NULL,created_at=now(),updated_by=$5,source='自动保存' WHERE id=$1 AND document_id=$6 AND COALESCE(version_name,'')='' AND autosave_lock_token=$7 RETURNING id",
          [
            previous.id,
            version,
            JSON.stringify(content),
            JSON.stringify(req.body.preview || []),
            req.user.id,
            req.params.id,
            req.body.lockToken,
          ],
        );
        coalesced = !!replaced.rows.length;
      }
      if (!coalesced) {
        await c.query(
          "INSERT INTO cloud_document_versions(id,document_id,content,preview,updated_by,source,version_name,autosave_lock_token) VALUES($1,$2,$3,$4,$5,$6,'',$7)",
          [
            version,
            req.params.id,
            JSON.stringify(content),
            JSON.stringify(req.body.preview || []),
            req.user.id,
            automatic ? "自动保存" : "BaizeFig",
            automatic ? req.body.lockToken : null,
          ],
        );
      }
      await compactVersion(c, version, req.user.id);
      await c.query("DELETE FROM cloud_rolling_drafts WHERE document_id=$1", [
        req.params.id,
      ]);
      await c.query("DELETE FROM cloud_rolling_archives WHERE document_id=$1", [
        req.params.id,
      ]);
      await collectSharedGarbage(c, req.user.id);
      const used = { bytes: (await storageUsage(c, req.user.id)).logicalBytes };
      if (Number(used.bytes) > Number(account.storage_limit_bytes))
        throw error(413, "云空间容量不足，请删除历史版本或联系管理员扩容");
      const savedFolder = (
        await c.query("SELECT folder_id FROM cloud_documents WHERE id=$1", [
          req.params.id,
        ])
      ).rows[0]?.folder_id;
      await touchCloudFolders(c, req.user.id, [savedFolder]);
      return { headId: version, coalesced: !!coalesced };
    });
    res.json({
      ...version,
      folderApplied: hasFolder,
      overwriteApplied: false,
    });
  });
  app.post(
    "/api/v1/space/files/:id/versions/:version/restore",
    owner,
    write,
    async (req, res) => {
      const restored = await transaction(db, async (c) => {
        const account = (
          await c.query(
            "SELECT storage_limit_bytes FROM users WHERE id=$1 FOR UPDATE",
            [req.user.id],
          )
        ).rows[0];
        const original = (
          await c.query(
            "SELECT * FROM cloud_documents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [req.params.id, req.user.id],
          )
        ).rows[0];
        if (!original) throw error(404, "文件不存在");
        const snapshot = await hydrateVersion(
          c,
          (
            await c.query(
              "SELECT * FROM cloud_document_versions WHERE id=$1 AND document_id=$2",
              [req.params.version, original.id],
            )
          ).rows[0],
          req.user.id,
        );
        if (!snapshot) throw error(404, "版本不存在");
        const day = (
          await c.query(
            "SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYYMMDD') AS day",
          )
        ).rows[0].day;
        let name;
        do {
          const counter = (
            await c.query(
              "INSERT INTO cloud_restore_counters(user_id,document_id,day,sequence) VALUES($1,$2,$3,1) ON CONFLICT(user_id,document_id,day) DO UPDATE SET sequence=cloud_restore_counters.sequence+1 RETURNING sequence",
              [req.user.id, original.id, day],
            )
          ).rows[0];
          const suffix =
            "_" + day + String(counter.sequence).padStart(3, "0") + "(恢复)";
          name =
            original.name
              .replace(/\.(?:baizefig|heyso)$/i, "")
              .slice(0, 120 - suffix.length) + suffix;
        } while (
          (
            await c.query(
              "SELECT id FROM cloud_documents WHERE user_id=$1 AND name=$2",
              [req.user.id, name],
            )
          ).rows.length
        );
        const id = randomUUID(),
          headId = randomUUID();
        const content = { ...snapshot.content, id, name };
        if (original.app === "heyso") { content.workspace.projects[0].name = name; }
        await c.query(
          "INSERT INTO cloud_documents(id,user_id,folder_id,name,head_id,app) VALUES($1,$2,$3,$4,$5,$6)",
          [id, req.user.id, original.folder_id, name, headId,original.app],
        );
        await c.query(
          "INSERT INTO cloud_document_versions(id,document_id,content,preview,updated_by,source,version_name) VALUES($1,$2,$3,$4,$5,'版本恢复','恢复副本')",
          [
            headId,
            id,
            JSON.stringify(content),
            JSON.stringify(snapshot.preview || []),
            req.user.id,
          ],
        );
        await compactVersion(c, headId, req.user.id);
        const used = {
          bytes: (await storageUsage(c, req.user.id)).logicalBytes,
        };
        if (Number(used.bytes) > Number(account.storage_limit_bytes))
          throw error(413, "云空间容量不足，无法恢复副本");
        await touchCloudFolders(c, req.user.id, [original.folder_id]);
        return { id, name, headId, folderId: original.folder_id };
      });
      res.json(restored);
    },
  );
  app.get("/api/v1/space/files/:id/thumbnail", owner, async (req, res) => {
    const file = await document(req.user.id, req.params.id);
    const version = await effectiveVersion(db, file);
    res.set("Cache-Control", "no-store");
    res.json({
      thumbnail: version?.preview?.[0] || null,
      headId: file.head_id,
    });
  });
  app.get("/api/v1/space/files/:id", owner, async (req, res) => {
    const file = await document(req.user.id, req.params.id);
    const versions = (
      await db.query(
        "SELECT v.id,v.created_at,COALESCE(v.logical_bytes,octet_length(v.content::text)) AS size_bytes,COALESCE(v.preview_bytes,octet_length(v.preview::text)) AS preview_bytes,COALESCE(v.logical_bytes,octet_length(v.content::text)) AS total_bytes,COALESCE(NULLIF(u.name,''),u.username) AS updater,v.source,v.version_name FROM cloud_document_versions v LEFT JOIN users u ON u.id=v.updated_by WHERE v.document_id=$1 ORDER BY v.created_at DESC,v.id DESC",
        [file.id],
      )
    ).rows;
    const version = req.query.version
      ? await hydrateVersion(
          db,
          (
            await db.query(
              "SELECT * FROM cloud_document_versions WHERE document_id=$1 AND id=$2",
              [file.id, req.query.version],
            )
          ).rows[0],
          req.user.id,
        )
      : await effectiveVersion(db, file);
    const content = version?.content;
    const rolling = version?.draft;
    const draft = rolling
      ? {
          revision: rolling.revision,
          baseHeadId: rolling.base_head_id,
          stageId: rolling.stage_id,
          clientId: rolling.client_id,
          sequence: Number(rolling.sequence),
          updatedAt: rolling.updated_at,
          logicalBytes: Number(rolling.logical_bytes),
        }
      : null;
    const checkpoint = (
      await db.query(
        "SELECT stage_id,source FROM cloud_document_versions WHERE id=$1",
        [file.head_id],
      )
    ).rows[0];
    if (content && !req.query.version) { content.name = file.name; if(file.app === "heyso") content.workspace.projects[0].name = file.name; }
    if (req.query.download === "1")
      return res
        .type("application/json")
        .attachment(file.name.replace(/\.(?:baizefig|heyso)$/i, "") + applications[file.app].extension)
        .send(JSON.stringify(content));
    const archive = (
      await db.query(
        "SELECT archived_at,logical_bytes FROM cloud_rolling_archives WHERE document_id=$1",
        [file.id],
      )
    ).rows[0];
    res.json({
      file,
      versions,
      content,
      draft,
      archive,
      checkpoint,
      versionPolicy: "rolling-v1",
    });
  });
  app.post(
    "/api/v1/space/files/:id/versions/delete-unnamed",
    owner,
    write,
    async (req, res) => {
      const result = await transaction(db, async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        const file = (
          await c.query(
            "SELECT id FROM cloud_documents WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
            [req.params.id, req.user.id],
          )
        ).rows[0];
        if (!file) throw error(404, "文件不存在");
        const deleted = await c.query(
          `DELETE FROM cloud_document_versions v USING cloud_documents d WHERE v.document_id=d.id AND d.id=$1 AND d.user_id=$2 AND v.id IS DISTINCT FROM d.head_id AND NULLIF(btrim(v.version_name),'') IS NULL RETURNING COALESCE(v.logical_bytes,octet_length(v.content::text)) AS bytes`,
          [file.id, req.user.id],
        );
        const deletedCount = deleted.rows.length,
          freedBytes = deleted.rows.reduce(
            (sum, row) => sum + Number(row.bytes),
            0,
          );
        await collectSharedGarbage(c, req.user.id);
        if (deletedCount)
          await audit(c, req.user.id, "unnamed_versions_deleted", {
            document_id: file.id,
            count: deletedCount,
            freed_bytes: freedBytes,
          });
        return { deletedCount, freedBytes };
      });
      res.json(result);
    },
  );
  app.post(
    "/api/v1/space/files/:id/versions/:version/rename",
    owner,
    write,
    async (req, res) => {
      const file = await document(req.user.id, req.params.id);
      if(file.app==='heyso'&&file.heyso_live&&file.head_id===req.params.version)throw error(400,"实时项目维护当前数据，不支持命名当前保存版本");
      const name = req.body.name;
      if (typeof name !== "string" || name.trim().length > 100)
        throw error(400, "版本名称不能超过 100 个字符");
      // Serialize naming with HeySO's mutable checkpoint and background packing.
      // Clearing a name must not reopen an already frozen checkpoint window.
      const result = await transaction(db,async c=>{
        await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
        return c.query(
          'UPDATE cloud_document_versions SET version_name=$3,heyso_window_start=NULL WHERE id=$1 AND document_id=$2 RETURNING id',
          [req.params.version,file.id,name.trim()]);
      });
      if (!result.rows.length) throw error(404, "版本不存在");
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/space/files/:id/versions/:version/delete",
    owner,
    write,
    async (req, res) => {
      const file = await document(req.user.id, req.params.id);
      if (file.head_id === req.params.version)
        throw error(409, "不能删除当前版本");
      await transaction(db, async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.user.id,
        ]);
        await c.query(
          "DELETE FROM cloud_document_versions v USING cloud_documents d WHERE v.id=$1 AND v.document_id=$2 AND d.id=v.document_id AND v.id IS DISTINCT FROM d.head_id",
          [req.params.version, file.id],
        );
        await collectSharedGarbage(c, req.user.id);
      });
      res.json({ ok: true });
    },
  );
  app.post("/api/v1/space/files/:id/move", owner, write, async (req, res) => {
    await transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      const file = await document(req.user.id, req.params.id);
      await assertFileUnlocked(c, req.user.id, req.params.id);
      await folder(req.user.id, req.body.folderId);
      await c.query(
        "UPDATE cloud_documents SET folder_id=$3 WHERE id=$1 AND user_id=$2",
        [req.params.id, req.user.id, req.body.folderId || null],
      );
      await touchCloudFolders(c, req.user.id, [
        file.folder_id,
        req.body.folderId,
      ]);
    });
    res.json({ ok: true });
  });
  const purgeExpired = () => purgeExpiredCloudTrash(db);
  installCloudFolders(app, { db, owner, write, error });
  installCloudDriveActions(app, { db, owner, write, error });
  app.get("/api/v1/space/trash", owner, async (req, res) => {
    await purgeExpired();
    res.json({
      folders: (
        await db.query(
          "SELECT * FROM cloud_folders WHERE user_id=$1 AND deleted_at IS NOT NULL AND trash_root=id ORDER BY deleted_at DESC",
          [req.user.id],
        )
      ).rows,
      files: (
        await db.query(
          "SELECT * FROM cloud_documents WHERE user_id=$1 AND deleted_at IS NOT NULL AND trash_root IS NULL ORDER BY deleted_at DESC",
          [req.user.id],
        )
      ).rows,
    });
  });
  app.post("/api/v1/space/files/:id/delete", owner, write, async (req, res) => {
    await transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      await assertFileUnlocked(c, req.user.id, req.params.id);
      const result = await c.query(
        "UPDATE cloud_documents SET deleted_at=now(),share_token=NULL WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id",
        [req.params.id, req.user.id],
      );
      if (!result.rows.length) throw error(404, "文件不存在");
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/v1/space/files/:id/restore",
    owner,
    write,
    async (req, res) => {
      await purgeExpired();
      const result = await db.query(
        "UPDATE cloud_documents SET deleted_at=NULL,folder_id=CASE WHEN EXISTS(SELECT 1 FROM cloud_folders f WHERE f.id=cloud_documents.folder_id AND f.deleted_at IS NULL) THEN folder_id ELSE NULL END WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL AND trash_root IS NULL RETURNING id",
        [req.params.id, req.user.id],
      );
      if (!result.rows.length) throw error(404, "文件不存在或已过期");
      res.json({ ok: true });
    },
  );
  app.post("/api/v1/space/files/:id/purge", owner, write, async (req, res) => {
    await transaction(db, async (c) => {
      const row = await c.query(
        "SELECT id FROM cloud_documents WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL FOR UPDATE",
        [req.params.id, req.user.id],
      );
      if (!row.rows.length) throw error(404, "回收站文件不存在");
      await archiveCloudFiles(c, "d.id=$1 AND d.user_id=$2", [
        req.params.id,
        req.user.id,
      ]);
      await c.query(
        "DELETE FROM cloud_document_versions WHERE document_id=$1",
        [req.params.id],
      );
      await c.query("DELETE FROM cloud_documents WHERE id=$1", [req.params.id]);
    });
    res.json({ ok: true });
  });
  app.post("/api/v1/space/files/:id/share", owner, write, async (req, res) => {
    await document(req.user.id, req.params.id);
    const days = req.body.days === undefined ? 7 : Number(req.body.days);
    if (![0,1,7,30].includes(days)) throw error(400, "分享有效期须为 1、7、30 天或长期有效");
    const file = await document(req.user.id, req.params.id);
    const token = req.body.revoke ? null : (file.share_token || randomUUID() + randomUUID());
    const expires = token && days ? new Date(Date.now()+days*86400000) : null;
    await db.query("UPDATE cloud_documents SET share_token=$3,share_expires_at=$4 WHERE id=$1 AND user_id=$2",[req.params.id,req.user.id,token,expires]);
    await audit(db, req.user.id, req.body.revoke ? "share_revoked" : "share_updated", { document_id: req.params.id });
    res.json({ url: token ? "/share/" + token : null, expiresAt: expires });
  });
  app.get("/share/:token", async (req, res) => {
    const file = (await db.query("SELECT * FROM cloud_documents WHERE share_token=$1 AND deleted_at IS NULL AND (share_expires_at IS NULL OR share_expires_at>now())", [req.params.token])).rows[0];
    if (!file) return res.sendStatus(404);
    const version = await effectiveVersion(db, file, { drafts: false });
    res.set("Cache-Control", "no-store");
    if(file.app === 'heyso') {
      const project=version?.content?.workspace?.projects?.[0];
      const summary=project ? `<p>${html(project.goal||'尚未设置目标')}</p><p>项目周期：${html(project.startDate||'待设置')} 至 ${html(project.endDate||'待设置')}</p><p>${version.content.workspace.items.length} 个工作项 · ${version.content.workspace.sprints.length} 个冲刺 · ${version.content.workspace.releases.length} 个发布版本</p>` : '<p>尚无项目快照</p>';
      return render(req,res,'HeySO 只读分享',`<section class="card"><h1>${html(file.name)}</h1><p>HeySO 项目概览 · 只读分享</p>${summary}<p class="muted">此链接仅展示项目概览，不提供源文件或编辑权限。</p></section>`);
    }
    render(req,res,"只读分享",`<section class="card"><h1>${html(file.name)}</h1><p>只读分享 · 最新正式版本的首个画布预览</p>${(version?.preview || []).slice(0,1).map(p=>`<img alt="画布预览" class="share-preview" src="${html(p)}">`).join("") || '<p>此版本尚无预览，请联系文件所有者在编辑器中重新保存。</p>'}<p class="muted">此链接不提供源文件或编辑权限。</p></section>`);
  });
  app.get("/space", login, (req, res) =>
    render(
      req,
      res,
      "云空间",
      `<section class="card"><a href="/console">返回控制台</a><div id="space" data-csrf="${html(req.session.data.csrf)}"></div></section>`,
      spaceScript,
    ),
  );
}
export const spaceScript = readFileSync(
  new URL("./drive-ui.js", import.meta.url),
  "utf8",
);

export const spacePanel = (csrf) =>
  `<section class="card"><div id="space" data-csrf="${html(csrf)}"></div></section>`;
