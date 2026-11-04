// Linkify plain URLs only in prose; existing links and code keep their meaning.
export default function linkifyMarkdown(){return tree=>{
  const walk=node=>{
    if(!node.children||['link','code','inlineCode','image'].includes(node.type))return;
    node.children=node.children.flatMap(child=>{
      if(child.type!=='text'){walk(child);return [child];}
      const value=child.value,parts=[];let last=0;
      for(const match of value.matchAll(/https?:\/\/[^\s<>，。；！、]+/g)){
        let url=match[0].replace(/[.,;!?:\]}]+$/,'');
        while(url.endsWith(')')&&(url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length)url=url.slice(0,-1);
        if(!url)continue;
        if(match.index>last)parts.push({type:'text',value:value.slice(last,match.index)});
        parts.push({type:'link',url,children:[{type:'text',value:url}]});last=match.index+url.length;
      }
      if(!parts.length)return [child];
      if(last<value.length)parts.push({type:'text',value:value.slice(last)});
      return parts;
    });
  };walk(tree);
};}
