import React,{useEffect,useRef,useState} from 'react';
// Exit animation only. Ant Modal/Drawer own focus trapping, Escape and focus return.
// Closing content must not stay interactive; aria-hidden would hide its still-focused drawer.
export default function Presence({present,children}){
 const [mounted,setMounted]=useState(present),last=useRef(children);if(present)last.current=children;
 useEffect(()=>{if(present){setMounted(true);return;}const timer=setTimeout(()=>setMounted(false),200);return()=>clearTimeout(timer);},[present]);
 return !present&&!mounted?null:<div className="presence" data-state={present?'open':'closing'} inert={!present}>{present?children:last.current}</div>;
}
