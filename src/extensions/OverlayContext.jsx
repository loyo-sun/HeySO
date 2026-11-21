import {createContext,useContext} from 'react';
export const OverlayContext=createContext(()=>document.body);
export const useOverlayContainer=()=>useContext(OverlayContext);
