import React from "react";
import TypeList from "./TypeList.jsx";
import TypeHierarchy from "./TypeHierarchy.jsx";
import WorkflowSettings from "./WorkflowSettings.jsx";
export default function WorkConfigSettings(props) {
  const {project,items,section,config,setConfig,migration,setMigration,busy,onSave}=props;
  if(section==="types")return <TypeList config={config} setConfig={setConfig} items={items} busy={busy}/>;
  if(section==="hierarchy")return <TypeHierarchy project={project} config={config} setConfig={setConfig} items={items} busy={busy}/>;
  if(section==="states")return <WorkflowSettings project={project} items={items} config={config} setConfig={setConfig} migration={migration} setMigration={setMigration} busy={busy} onSave={onSave}/>;
  return null;
}
