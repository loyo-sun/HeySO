(() => {
  const root = document.querySelector("#space");
  if (!root) return;
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  function folderIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
    );
    svg.append(path);
    return svg;
  }

  let data = { files: [], folders: [] },
    parent = null,
    trash = false,
    view = "list",
    query = "",
    sort = { key: "name", direction: 1 },
    user = null,
    selected = null,
    menu = null,
    storeKey = "",
    searchAll = true;
  const selectedEntries = new Map();
  const api = async (path, body) => {
    const r = await fetch(
      "/api/v1/space" + path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, csrf: root.dataset.csrf }),
          },
    );
    const result = await r.json();
    if (!r.ok) throw Error(result.error_description || "操作失败");
    return result;
  };
  function modal(title, content) {
    const dialog = el("dialog", undefined, "ld-dialog");
    const header = el("header");
    header.append(el("h2", title));
    const close = el("button", "×");
    close.setAttribute("aria-label", "关闭");
    close.onclick = () => dialog.close();
    header.append(close);
    dialog.append(header, content);
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  function ask(message, initial, confirmOnly = false) {
    return new Promise((resolve) => {
      const form = el("form");
      form.append(el("p", message));
      const input = el("input");
      input.value = initial || "";
      if (!confirmOnly) {
        input.setAttribute("aria-label", message);
        form.append(input);
      }
      const footer = el("footer"),
        cancel = el("button", "取消"),
        ok = el("button", "确定", "primary");
      cancel.type = "button";
      ok.type = "submit";
      footer.append(cancel, ok);
      form.append(footer);
      const d = modal(confirmOnly ? "确认操作" : "输入", form);
      let settled = false;
      d.addEventListener("close", () => {
        if (!settled) resolve(null);
      });
      cancel.onclick = () => d.close();
      form.onsubmit = (e) => {
        e.preventDefault();
        settled = true;
        resolve(confirmOnly ? true : input.value);
        d.close();
      };
      (confirmOnly ? cancel : input).focus();
    });
  }
  function message(text) {
    const c = el("div");
    c.append(el("p", text));
    modal("提示", c);
  }
  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      message(e.message || "操作失败");
    }
  };
  const button = (text, fn, cls) => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = (e) => {
      e.stopPropagation();
      void run(() => fn(e));
    };
    return b;
  };
  function pathName(id) {
    const parts = [],
      seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const f = data.folders.find((f) => f.id === id);
      if (!f) break;
      parts.unshift(f.name);
      id = f.parent_id;
    }
    return ["云工作区", ...parts].join(" / ");
  }
  function persist() {
    try {
      localStorage.setItem(storeKey, JSON.stringify({ parent, view, sort }));
    } catch {}
  }
  async function load() {
    const next = await api(trash ? "/trash" : "");
    data = next;
    if (next.user) {
      user = next.user;
      if (!storeKey) {
        storeKey = "loyocloud.drive." + user.id;
        try {
          const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
          if (saved) {
            parent = saved.parent || null;
            view = saved.view === "grid" ? "grid" : "list";
            if (
              ["name", "owner", "updated_at", "size_bytes"].includes(
                saved.sort?.key,
              )
            )
              sort = {
                key: saved.sort.key,
                direction: saved.sort.direction === -1 ? -1 : 1,
              };
          }
        } catch {}
      }
    }
    if (!trash && parent && !data.folders.some((f) => f.id === parent)) {
      parent = null;
      persist();
    }
    draw();
    window.dispatchEvent(new CustomEvent('loyo-drive-changed'));
  }
  function navigate(id) {
    parent = id;
    trash = false;
    persist();
    void run(load);
  }
  const size = (v) =>
    Number(v) >= 1048576
      ? (Number(v) / 1048576).toFixed(2) + " MB"
      : (Number(v || 0) / 1024).toFixed(1) + " KB";
  const date = (v) => (v ? new Date(v).toLocaleString("zh-CN") : "—");
  function showMenu(x, y, items) {
    menu?.remove();
    menu = el("div", undefined, "ld-menu");
    menu.setAttribute("role", "menu");
    menu.style.left = Math.min(x, innerWidth - 190) + "px";
    menu.style.top =
      Math.max(8, Math.min(y, innerHeight - items.length * 39 - 20)) + "px";
    for (const item of items) {
      const b = button(item.label, async () => {
        menu?.remove();
        menu = null;
        await item.run();
      });
      b.setAttribute("role", "menuitem");
      menu.append(b);
    }
    document.body.append(menu);
    menu.querySelector("button")?.focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.contains(e.target)) {
      menu.remove();
      menu = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu) {
      menu.remove();
      menu = null;
    }
  });
  async function newFolder(id = parent) {
    const name = await ask("新建文件夹");
    if (name?.trim()) {
      await api("/folders", { name: name.trim(), parentId: id });
      await load();
    }
  }
  async function downloadEntry(entry) {
    const f = entry.item,
      url =
        "/api/v1/space/" +
        (entry.folder ? "folders/" : "files/") +
        f.id +
        (entry.folder ? "/download" : "?download=1");
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw Error(error.error_description || "下载失败");
    }
    const a = el("a");
    a.href = URL.createObjectURL(await response.blob());
    a.download = f.name + (entry.folder ? ".zip" : f.app === "heyso" ? ".heyso" : ".baizefig");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function openEntry(entry) {
    if (entry.folder) navigate(entry.item.id);
    else {
      const choices=(data.applications||[]).filter(a=>a.id===entry.item.app&&a.url);
      const open=(application)=>{const url=new URL(application.url);if(!['https:','http:'].includes(url.protocol))throw Error('请从设备打开此应用');url.searchParams.set('cloudFile',entry.item.id);window.open(url.href,'_blank','noopener');};
      if(choices.length===1)return open(choices[0]);
      if(!choices.length)return message('请先从你正在使用的 '+(entry.item.app==='heyso'?'HeySO':'BaizeFig')+' 登录 LoyoCloud，再打开云文件。');
      const content=el('div');content.append(el('p','选择已授权的应用来源。'));
      const dialog=modal('选择打开文件的应用',content);
      for(const application of choices)content.append(button(application.name+' · '+application.origin,()=>{dialog.close();open(application);}));
    }
  }
  async function moveEntry(entry) {
    let target = entry.folder ? entry.item.parent_id : entry.item.folder_id;
    const forbidden = new Set();
    if (entry.folder) {
      forbidden.add(entry.item.id);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of data.folders)
          if (forbidden.has(f.parent_id) && !forbidden.has(f.id)) {
            forbidden.add(f.id);
            changed = true;
          }
      }
    }
    const content = el("div"),
      d = modal("移动到", content);
    function render() {
      content.replaceChildren(el("p", pathName(target)));
      if (target)
        content.append(
          button("上一级", () => {
            target =
              data.folders.find((f) => f.id === target)?.parent_id || null;
            render();
          }),
        );
      for (const f of data.folders.filter(
        (f) => f.parent_id === target && !forbidden.has(f.id),
      ))
        content.append(
          button(
            "▰ " + f.name,
            () => {
              target = f.id;
              render();
            },
            "ld-folder-choice",
          ),
        );
      content.append(
        button(
          "移动到此处",
          async () => {
            await api(
              "/" +
                (entry.folder ? "folders" : "files") +
                "/" +
                entry.item.id +
                "/move",
              { folderId: target },
            );
            d.close();
            await load();
          },
          "primary",
        ),
      );
    }
    render();
  }
  async function properties(entry, tab = "basic") {
    const detail = await api(
      "/" + (entry.folder ? "folders/" : "files/") + entry.item.id,
    );
    const f = entry.folder ? detail : detail.file;
    if(f.app==='heyso'&&f.heyso_live&&tab==='versions')tab='basic';
    const content = el("div"),
      d = modal(tab === "versions" ? "历史版本" : "文件属性", content);
    if (tab === "versions") d.classList.add("ld-wide");
    const panel = el("div");
    content.append(panel);
    function basic() {
      panel.replaceChildren();
      const summary = el("div", undefined, "ld-summary");
      const icon = el("span", "", "ld-type");
      if (entry.folder) icon.append(folderIcon());
      else {
        const image = el("img");
        image.src = f.app === "heyso" ? "/heyso-icon.svg" : "/baize-design.svg";
        image.alt = f.app === "heyso" ? "HeySO 项目" : "BaizeFig 设计文件";
        icon.append(image);
      }
      const label = el("div", undefined, "ld-file-name");
      label.append(el("strong", f.name.replace(/\.(?:baizefig|heyso)$/i, "")));
      if (!entry.folder) label.append(el("span", f.app === "heyso" ? ".heyso" : ".baizefig"));
      summary.append(icon, label);
      panel.append(summary);
      const dl = el("dl");
      for (const [label, value] of [
        ["种类", entry.folder ? "文件夹" : f.app === "heyso" ? "HeySO 项目" : "BaizeFig 设计文件"],
        ["大小", size(detail.size_bytes ?? entry.item.size_bytes)],
        ["位置", pathName(entry.folder ? f.parent_id : f.folder_id)],
        ["创建时间", date(f.created_at)],
        ["最后修改时间", date(f.updated_at)],
      ]) {
        dl.append(el("dt", label), el("dd", value));
      }
      panel.append(dl);
      if (!entry.folder) {
        const controls = el('div', undefined, 'uc-actions');
        controls.append(button('打开文件', () => openEntry(entry), 'primary'), ...(f.app==='heyso'&&f.heyso_live?[]:[button('历史版本', () => { d.close(); return properties(entry, 'versions'); })]), button('分享设置', () => { d.close(); return shareEntry(entry); }));
        panel.append(controls);
      }
    }
    const pendingVersionRenames = new Set();
    let namedOnly = false;
    function versions() {
      panel.replaceChildren();
      const filter = el("label", undefined, "ld-named-filter"),
        check = el("input");
      check.type = "checkbox";
      check.checked = namedOnly;
      check.onchange = () => {
        namedOnly = check.checked;
        versions();
      };
      filter.append(check, el("span", "只显示已命名版本"));
      panel.append(filter);
      const all = detail.versions || [],
        unnamed = all.filter(
          (v) => v.id !== f.head_id && !v.version_name?.trim(),
        );
      const total = all.reduce(
        (sum, v) => sum + Number(v.total_bytes ?? v.size_bytes ?? 0),
        0,
      );
      const summary = el(
        "p",
        "云端共 " + all.length + " 个版本 · 占用 " + size(total) + "",
        "ld-version-summary",
      );
      panel.append(summary);
      if (detail.draft)
        panel.append(
          el(
            "p",
            "另有 1 个滚动草稿 · 占用 " +
              size(detail.draft.logicalBytes) +
              "；每 15 分钟滚动存档，主动保存生成正式版本。",
            "ld-version-summary",
          ),
        );
      const cleanup = button(
        "删除未命名历史版本（" + unnamed.length + "）",
        async () => {
          await Promise.all([...pendingVersionRenames]);
          const latest = await api("/files/" + f.id);
          detail.versions = latest.versions;
          Object.assign(f, latest.file);
          const removable = latest.versions.filter(
            (v) => v.id !== f.head_id && !v.version_name?.trim(),
          );
          if (!removable.length) {
            versions();
            return;
          }
          if (
            !(await ask(
              "删除 " +
                removable.length +
                " 个未命名历史版本？最新版本和所有已命名版本将保留。",
              null,
              true,
            ))
          )
            return;
          cleanup.disabled = true;
          try {
            const result = await api(
              "/files/" + f.id + "/versions/delete-unnamed",
              {},
            );
            const next = await api("/files/" + f.id);
            detail.versions = next.versions;
            Object.assign(f, next.file);
            versions();
            await load();
            message(
              "已删除 " +
                result.deletedCount +
                " 个未命名历史版本，释放 " +
                size(result.freedBytes),
            );
          } finally {
            cleanup.disabled = false;
          }
        },
        "ld-danger",
      );
      cleanup.disabled = unnamed.length === 0;
      panel.append(cleanup);
      const table = el("table", undefined, "ld-versions"),
        head = el("tr");
      for (const name of [
        "时间",
        "更新者",
        "大小",
        "版本来源",
        "版本名称",
        "操作",
      ])
        head.append(el("th", name));
      table.append(head);
      for (const v of (detail.versions || []).filter(
        (v) => !namedOnly || v.version_name?.trim(),
      )) {
        const row = el("tr");
        for (const value of [
          new Date(v.created_at).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }),
          v.updater || "未记录",
          size(v.total_bytes ?? v.size_bytes),
          v.source || "未记录",
        ])
          row.append(el("td", value));
        const nameCell = el("td"),
          input = el("input");
        input.className = "ld-version-name";
        input.maxLength = 100;
        input.setAttribute("aria-label", "版本名称");
        const label = () =>
          v.version_name?.trim() ||
          (v.id === f.head_id ? "最新版本" : "历史版本");
        input.value = label();
        let finished = false;
        input.onfocus = () => {
          finished = false;
          input.value = v.version_name || "";
          input.select();
        };
        async function commit() {
          if (finished) return;
          finished = true;
          const name = input.value.trim();
          input.value = label();
          try {
            if (name && name !== (v.version_name || "")) {
              const operation = api(
                "/files/" + f.id + "/versions/" + v.id + "/rename",
                { name },
              );
              pendingVersionRenames.add(operation);
              try {
                await operation;
              } finally {
                pendingVersionRenames.delete(operation);
              }
              v.version_name = name;
              input.value = label();
              if (namedOnly) versions();
            }
          } catch (e) {
            input.value = label();
            message(e.message);
          }
        }
        input.onblur = commit;
        input.onkeydown = (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            commit();
            input.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            finished = true;
            input.value = label();
            input.blur();
          }
        };
        nameCell.append(input);
        row.append(nameCell);
        const actions = el("td");
        actions.append(
          button("恢复", async () => {
            if (await ask("将此版本恢复为新文件？", null, true)) {
              const result = await api(
                "/files/" + f.id + "/versions/" + v.id + "/restore",
                {},
              );
              await load();
              message("已创建 " + result.name);
            }
          }),
        );
        row.append(actions);
        table.append(row);
      }
      panel.append(table);
    }
    (tab === "versions" ? versions : basic)();
  }
  function actions(entry) {
    const f = entry.item,
      base = "/" + (entry.folder ? "folders/" : "files/") + f.id;
    if (trash)
      return [
        {
          label: "恢复",
          run: async () => {
            await api(base + "/restore", {});
            await load();
          },
        },
        {
          label: "彻底删除",
          run: async () => {
            if (
              await ask(
                "彻底删除「" + f.name + "」？用户无法恢复。",
                null,
                true,
              )
            ) {
              await api(base + "/purge", {});
              await load();
            }
          },
        },
      ];
    return [
      { label: "打开", run: () => openEntry(entry) },
      {
        label: "重命名",
        run: async () => {
          const name = await ask("重命名", f.name);
          if (name?.trim()) {
            await api(base + "/rename", { name: name.trim() });
            await load();
          }
        },
      },
      { label: "下载", run: () => downloadEntry(entry) },
      { label: "移动", run: () => moveEntry(entry) },
      ...(!entry.folder
        ? [...(entry.item.app==='heyso'&&entry.item.heyso_live?[]:[{ label: "历史版本", run: () => properties(entry, "versions") }]), { label: '分享设置', run: () => shareEntry(entry) }]
        : []),
      { label: "属性", run: () => properties(entry) },
      {
        label: "移至回收站",
        run: async () => {
          if (await ask("移至回收站并保留 30 天？", null, true)) {
            await api(base + "/delete", {});
            await load();
          }
        },
      },
    ];
  }
  function draw() {
    root.className = "loyo-drive";
    root.replaceChildren();
    const header = el("header", undefined, "ld-header"),
      path = el("nav"),
      chain = [];
    let cursor = parent;
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const f = data.folders.find((f) => f.id === cursor);
      if (!f) break;
      chain.unshift(f);
      cursor = f.parent_id;
    }
    const rootButton = button(
      trash ? "回收站" : "云工作区",
      (e) => {
        if (parent && !trash) {
          navigate(null);
          return;
        }
        if (!trash) {
          const rect = e.currentTarget.getBoundingClientRect();
          showMenu(rect.left, rect.bottom, [
            { label: "新建文件夹", run: () => newFolder(null) },
          ]);
        }
      },
      "ld-root",
    );
    path.append(rootButton);
    if (!parent && !trash) rootButton.append(el("span", " ▾"));
    if (!trash)
      for (const [i, f] of chain.entries()) {
        path.append(el("span", "›"));
        path.append(
          button(f.name + (i === chain.length - 1 ? " ▾" : ""), (e) => {
            if (i !== chain.length - 1) navigate(f.id);
            else {
              const rect = e.currentTarget.getBoundingClientRect();
              showMenu(rect.left, rect.bottom, [
                { label: "新建文件夹", run: () => newFolder(f.id) },
                ...actions({ folder: true, item: f }).filter(
                  (a) => a.label !== "打开",
                ),
              ]);
            }
          }),
        );
      }
    header.append(path);
    const tools = el("div", undefined, "ld-tools"),
      search = el("input");
    search.type = "search";
    search.placeholder = "搜索文件或文件夹";
    search.setAttribute("aria-label", "搜索文件");
    search.value = query;
    search.oninput = () => {
      query = search.value;
      drawEntries();
    };
    tools.append(search);
    const scope = el('select'); scope.setAttribute('aria-label', '搜索范围');
    for (const [value,label] of [['all','全部文件'],['folder','当前文件夹']]) { const o=el('option',label);o.value=value;scope.append(o); }
    scope.value=searchAll?'all':'folder'; scope.onchange=()=>{searchAll=scope.value==='all';drawEntries();}; tools.append(scope);
    if (!trash) tools.append(button('新建文件夹', () => newFolder(parent), 'primary'));
    const batch = button('批量操作', async e => {
      if (!selectedEntries.size) { message('请先勾选需要操作的文件或文件夹。'); return; }
      const r=e.currentTarget.getBoundingClientRect();showMenu(r.left,r.bottom,[
        {label:'下载所选（'+selectedEntries.size+'）',run:()=>batchAction('download')},
        {label:trash?'恢复所选':'移至回收站',run:()=>batchAction(trash?'restore':'delete')},
      ]);
    });tools.append(batch);
    for (const [id, text] of [
      ["list", "☰"],
      ["grid", "▦"],
    ]) {
      const b = button(text, () => {
        view = id;
        persist();
        draw();
      });
      b.setAttribute("aria-label", id === "list" ? "列表模式" : "图标模式");
      b.setAttribute("aria-pressed", String(view === id));
      tools.append(b);
    }
    tools.append(
      button("刷新", load),
      button(
        trash ? "返回文件" : "回收站",
        async () => {
          trash = !trash;
          await load();
        },
        "ld-danger",
      ),
    );
    header.append(tools);
    root.append(header);
    const area = el("div", undefined, "ld-area");
    root.append(area);
    function drawEntries() {
      area.replaceChildren();
      const entries = [
        ...data.folders
          .filter(
            (f) =>
              (trash || (query.trim() && searchAll) || f.parent_id === parent) &&
              f.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((item) => ({ folder: true, item })),
        ...data.files
          .filter(
            (f) =>
              (trash || (query.trim() && searchAll) || f.folder_id === parent) &&
              f.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((item) => ({ folder: false, item })),
      ];
      const value = (e) =>
        sort.key === "owner"
          ? e.item.owner || user?.username || "我"
          : sort.key === "size_bytes"
            ? Number(e.item.size_bytes || 0)
            : sort.key === "updated_at"
              ? new Date(e.item.updated_at || e.item.created_at || 0).getTime()
              : e.item.name;
      entries.sort((a, b) => {
        const av = value(a),
          bv = value(b);
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "zh-CN", {
                numeric: true,
              })) * sort.direction || a.item.id.localeCompare(b.item.id)
        );
      });
      const table = el("table", undefined, "ld-table ld-" + view),
        thead = el("thead"),
        head = el("tr");
      for (const [key, name] of [
        ["name", "名称"],
        ["owner", "所有人"],
        ["updated_at", "修改时间"],
        ["size_bytes", "文件大小"],
      ]) {
        const th = el("th");
        th.setAttribute(
          "aria-sort",
          sort.key === key
            ? sort.direction === 1
              ? "ascending"
              : "descending"
            : "none",
        );
        th.append(
          button(
            name +
              (sort.key === key ? (sort.direction === 1 ? " ↑" : " ↓") : ""),
            () => {
              sort = { key, direction: sort.key === key ? -sort.direction : 1 };
              persist();
              drawEntries();
            },
          ),
        );
        head.append(th);
      }
      head.append(el("th"));
      thead.append(head);
      table.append(thead);
      const body = el("tbody");
      for (const entry of entries) {
        const f = entry.item,
          row = el("tr", undefined, entry.folder ? "ld-folder" : "");
        row.onclick = () => {
          for (const r of body.children) r.classList.remove("ld-selected");
          row.classList.add("ld-selected");
        };
        const selector=el('input');selector.type='checkbox';selector.setAttribute('aria-label','选择 '+f.name);selector.checked=selectedEntries.has(f.id);selector.onclick=e=>e.stopPropagation();selector.onchange=()=>{if(selector.checked)selectedEntries.set(f.id,entry);else selectedEntries.delete(f.id);};
        row.ondblclick = () => {
          if (!trash) void run(() => openEntry(entry));
        };
        row.oncontextmenu = (e) => {
          e.preventDefault();
          showMenu(e.clientX, e.clientY, actions(entry));
        };
        if (!trash && !entry.folder) {
          row.draggable = true;
          row.ondragstart = (e) => {
            e.dataTransfer.setData("application/x-loyo-file", f.id);
          };
        }
        if (entry.folder && !trash) {
          row.ondragover = (e) => {
            if (e.dataTransfer.types.includes("application/x-loyo-file")) {
              e.preventDefault();
              row.classList.add("ld-drop");
            }
          };
          row.ondragleave = (e) => {
            if (!row.contains(e.relatedTarget)) row.classList.remove("ld-drop");
          };
          row.ondrop = (e) => {
            e.preventDefault();
            row.classList.remove("ld-drop");
            const id = e.dataTransfer.getData("application/x-loyo-file");
            if (id)
              void run(async () => {
                await api("/files/" + id + "/move", { folderId: f.id });
                await load();
              });
          };
        }
        const name = el("td", undefined, "ld-name"),
          title = el("div", undefined, "ld-title");
        const icon = el("span", "", "ld-type");
        if (entry.folder) icon.append(folderIcon());
        if (!entry.folder) {
          const image = el("img");
          image.src = f.app === "heyso" ? "/heyso-icon.svg" : "/baize-design.svg";
          image.alt = f.app === "heyso" ? "HeySO 项目" : "BaizeFig 设计文件";
          icon.append(image);
        }
        title.append(icon, el("strong", f.name.replace(/\.(?:baizefig|heyso)$/i, "")));
        if(!entry.folder) title.append(el("small", f.app === "heyso" ? ".heyso" : ".baizefig"));
        title.prepend(selector);name.append(title);
        if (query.trim() && searchAll) name.append(el('small', pathName(entry.folder?f.parent_id:f.folder_id), 'uc-file-path'));
        if (view === "grid" && !entry.folder) {
          const preview = el("div", undefined, "ld-thumbnail");
          name.append(preview);
          void api("/files/" + f.id + "/thumbnail")
            .then((d) => {
              if (d.thumbnail) {
                const img = el("img");
                img.src = d.thumbnail;
                img.alt = f.name;
                preview.append(img);
              }
            })
            .catch(() => {});
        }
        row.append(
          name,
          el("td", f.owner || user?.username || "我"),
          el("td", date(f.updated_at || f.created_at)),
          el("td", entry.folder ? "—" : size(f.size_bytes)),
        );
        const more = el("td", undefined, "ld-more");
        more.append(
          button("⋮", (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            showMenu(rect.right - 180, rect.bottom, actions(entry));
          }),
        );
        row.append(more);
        body.append(row);
      }
      table.append(body);
      area.append(table);
      if (!entries.length)
        area.append(
          el("p", query ? "没有匹配的文件" : "此文件夹为空", "ld-empty"),
        );
    }
    drawEntries();
  }
  async function shareEntry(entry) {
    const detail=await api('/files/'+entry.item.id),f=detail.file;
    const form=el('form'),label=el('label','链接有效期'),select=el('select');
    for(const [value,name] of [[1,'1 天'],[7,'7 天'],[30,'30 天'],[0,'长期有效']]){const o=el('option',name);o.value=value;select.append(o);}select.value='7';label.append(select);
    form.append(el('p','分享仅提供最新正式版本的首个画布预览，不提供源文件和编辑权限。'),label);
    if(f.share_token){const link=el('input');link.readOnly=true;link.value=location.origin+'/share/'+f.share_token;link.setAttribute('aria-label','分享链接');form.append(link,el('p',f.share_expires_at?'到期：'+date(f.share_expires_at):'长期有效'));}
    const d=modal('分享设置',form),controls=el('div',undefined,'uc-actions');
    controls.append(button(f.share_token?'更新有效期并复制':'创建并复制链接',async()=>{const result=await api('/files/'+f.id+'/share',{days:Number(select.value)});const url=location.origin+result.url;try{await navigator.clipboard.writeText(url);d.close();message('分享链接已复制');}catch{const input=el('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','分享链接');form.append(input);input.select();}} ,'primary'));
    if(f.share_token)controls.append(button('撤销链接',async()=>{if(await ask('撤销后，现有链接立即失效。确认撤销？',null,true)){await api('/files/'+f.id+'/share',{revoke:true});d.close();message('分享链接已撤销');}},'ld-danger'));
    form.append(controls);
  }
  async function batchAction(action){
    const entries=[...selectedEntries.values()];
    if(action==='delete'&&!(await ask('将选中的 '+entries.length+' 项移至回收站？分享链接将失效。',null,true)))return;
    const failed=[];
    for(const entry of entries){try{if(action==='download')await downloadEntry(entry);else await api('/'+(entry.folder?'folders/':'files/')+entry.item.id+'/'+action,{});selectedEntries.delete(entry.item.id);}catch(e){failed.push(entry.item.name+'：'+e.message);}}
    await load();message(failed.length?'部分操作未完成：\n'+failed.join('\n'):'已完成 '+entries.length+' 项操作');
  }
  window.addEventListener('loyo-drive-action',e=>void run(async()=>{
    if(e.detail.action==='new-folder')await newFolder(parent);
    if(e.detail.action==='trash'){trash=true;selectedEntries.clear();await load();}
  }));
  void run(load);
})();
