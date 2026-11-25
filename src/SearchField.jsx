import React,{forwardRef,useImperativeHandle,useRef} from 'react';
import {Search,X} from 'lucide-react';
import {ReplicaInput} from './ReplicaControls.jsx';

// A single border and focus ring across page toolbars, filters and popups.
const SearchField=forwardRef(function SearchField({className='',value,onClear,clearLabel='清空搜索',...props},ref){
  const input=useRef(null);
  useImperativeHandle(ref,()=>input.current);
  return <div className={`heyso-search-field ${className}`}>
    <Search size={15} aria-hidden="true"/>
    <ReplicaInput {...props} ref={input} type="search" value={value}/>
    {onClear&&value&&<button type="button" className="heyso-search-clear" aria-label={clearLabel} onClick={()=>{onClear();input.current?.focus();}}><X size={14} aria-hidden="true"/></button>}
  </div>;
});
export default SearchField;
