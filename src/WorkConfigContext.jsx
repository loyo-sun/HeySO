import { createContext, useContext } from "react";
export const WorkConfigContext = createContext(null);
export const useWorkProject = () => useContext(WorkConfigContext);
