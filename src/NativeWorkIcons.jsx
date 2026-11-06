import React from 'react';
import { Target, Layers, BookOpen, ClipboardCheck, ListTree, Telescope, Palette, FileText, Megaphone, Database, Bug, Star, Milestone, RefreshCw, Handshake, Lightbulb, Circle, CircleDashed, LoaderCircle, CirclePause, Hourglass, CircleCheck, CircleX } from 'lucide-react';
import { typeIcon, typeFor, typeColor, categoryOf } from '../shared/work-config.mjs';
const typeIcons = { strategy:Target, epic:Layers, story:BookOpen, task:ClipboardCheck, subtask:ListTree, explore:Telescope, design:Palette, document:FileText, operations:Megaphone, data:Database, bug:Bug, incident:Star, release:Milestone, change:RefreshCw, support:Handshake, idea:Lightbulb };
const statusIcons = { backlog:CircleDashed, todo:Circle, active:LoaderCircle, blocked:CirclePause, review:Hourglass, done:CircleCheck, cancelled:CircleX };
export function NativeTypeIcon({ project, kind, size=16 }) {
  const type=typeFor(project,kind), Icon=typeIcons[typeIcon(type)]||ClipboardCheck;
  return <Icon size={size} color={typeColor(type)} aria-hidden="true" className="roadmap-native-type"/>;
}
export function NativeStatusIcon({ project, item, size=16 }) {
  const category=categoryOf(project,item.status,item.kind), Icon=statusIcons[category]||Circle;
  return <Icon size={size} className={'status-icon tone-'+category} aria-hidden="true"/>;
}
