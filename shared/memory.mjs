export const memoryTypes = {context: '工作上下文', decision: '关键决定', learning: '经验与复盘'};
export const memoryVersion = note => note.contentVersion || 1;
export function memoryEntry(note, operation, actor, at) {
  return {version: memoryVersion(note), operation, actor, at,
    type: note.type, title: note.title, body: note.body};
}
export function memoryHistory(note) {
  return note.history?.length ? note.history : [memoryEntry(note, 'create', note.author || '我', note.createdAt)];
}
