const key = (value) => String(value || "").normalize("NFKC").trim().toUpperCase();
const scope = (project) => project.accountId || "local";
export const validProjectCode = (code) => /^[A-Z][A-Z0-9]{1,7}$/.test(code);
export function availableProjectCode(projects, accountId, preferred = "HS") {
  const used = new Set(projects.filter((p) => scope(p) === (accountId || "local")).map((p) => key(p.code)));
  let code = preferred, n = 2;
  while (used.has(code)) code = preferred.slice(0, 8 - String(n).length) + n++;
  return code;
}
export function checkIdentifiers(state) {
  const names = new Set(), codes = new Set();
  for (const p of state.projects) {
    const name = JSON.stringify([scope(p),key(p.name)]), code = JSON.stringify([scope(p),key(p.code)]);
    if (names.has(name)) throw Error("当前空间内项目名称不能重复");
    if (!validProjectCode(p.code)) throw Error("项目 ID 需为 2 至 8 位大写字母或数字，且以字母开头");
    if (codes.has(code)) throw Error("当前空间内项目 ID 不能重复");
    names.add(name); codes.add(code);
    const numbers = new Set();
    for (const i of state.items.filter((i) => i.projectId === p.id)) {
      if (!Number.isSafeInteger(i.number) || i.number < 1 || numbers.has(i.number)) throw Error("项目内工作项序号必须为唯一正整数");
      numbers.add(i.number);
    }
    if (!Number.isSafeInteger(p.nextItemNumber) || p.nextItemNumber < 1 || [...numbers].some((n) => n >= p.nextItemNumber)) throw Error("项目工作项计数器无效");
  }
}
export function allocateItemNumber(project) {
  if (!Number.isSafeInteger(project.nextItemNumber) || project.nextItemNumber >= Number.MAX_SAFE_INTEGER) throw Error("工作项序号已达到上限");
  return project.nextItemNumber++;
}
// One-time upgrade: preserve existing item numbers and assign missing ones after them.
export function migrateIdentifiers(state) {
  if (state.numberingVersion === 1 || !Array.isArray(state.projects) || !Array.isArray(state.items)) return state;
  const processed = [];
  for (const p of state.projects) {
    const original = String(p.name || "项目").trim();
    let name = original, suffix = 2;
    while (processed.some((x) => scope(x) === scope(p) && key(x.name) === key(name))) name = `${original}（${suffix++}）`;
    p.name = name;
    const preferred = key(p.code);
    p.code = availableProjectCode(processed,p.accountId,validProjectCode(preferred) ? preferred : "HS");
    const items = state.items.filter((i) => i.projectId === p.id);
    const historical = [...(state.sprints || []).filter((s) => s.projectId === p.id).flatMap((s) => [...(s.baseline || []),...(s.finalStories || [])]), ...(state.releases || []).filter((r) => r.projectId === p.id).flatMap((r) => r.publishedStories || [])];
    p.nextItemNumber = Math.max(p.nextItemNumber || 1, ...[...items,...historical].map((i) => Number.isSafeInteger(i.number) ? i.number + 1 : 1));
    const seen = new Set();
    for (const i of items) {
      if (!Number.isSafeInteger(i.number) || i.number < 1 || seen.has(i.number)) i.number = allocateItemNumber(p);
      seen.add(i.number);
    }
    processed.push(p);
  }
  state.numberingVersion = 1;
  return state;
}
