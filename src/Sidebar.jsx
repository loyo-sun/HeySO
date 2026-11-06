import React from 'react';
import {SidebarContext} from './SidebarContext.jsx';
export default function Sidebar({compact,children,...props}){return <SidebarContext.Provider value={compact}><aside {...props}>{children}</aside></SidebarContext.Provider>;}
