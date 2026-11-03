import React from "react";
import { Target, Layers, Box, BookOpen, ListChecks, Bug, GitBranch, Flag, Sparkles, Code2, Palette, Search, FileText, Rocket, Circle, Diamond } from "lucide-react";
import { useWorkProject } from "./WorkConfigContext.jsx";
import { typeFor, typeColor, typeIcon } from "../shared/work-config.mjs";
const icons = { target: Target, layers: Layers, box: Box, book: BookOpen, checklist: ListChecks, bug: Bug, branch: GitBranch, flag: Flag, sparkles: Sparkles, code: Code2, palette: Palette, search: Search, file: FileText, rocket: Rocket, circle: Circle, diamond: Diamond };
export function TypeIcon({ kind, type, size = 14 }) {
  const project = useWorkProject();
  const resolved = type || typeFor(project, kind);
  const Icon = icons[typeIcon(resolved)] || Box;
  return <Icon size={size} style={{ color: typeColor(resolved), flexShrink: 0 }} aria-hidden="true"/>;
}
export default function WorkType({ kind, type }) {
  const project = useWorkProject();
  const resolved = type || typeFor(project, kind);
  const color = typeColor(resolved);
  return <span className="kind work-type" style={{ color, backgroundColor: color + "12" }}><TypeIcon kind={kind} type={resolved}/>{resolved?.name || kind}</span>;
}
