const WIDTH = 170, HEIGHT = 44, CLEARANCE = 12;
const same = (a, b) => a.x === b.x && a.y === b.y;
export function routeTransition(transition, points, index = 0) {
  const a = points[transition.from], b = points[transition.to];
  if (!b || (transition.from !== "*" && !a)) return null;
  if (transition.from === "*") return finish([{x:b.x+85,y:b.y-34},{x:b.x+85,y:b.y}], transition);
  const offset = 12 + (index % 3) * 10;
  let start, end, startStub, endStub;
  if (transition.from === transition.to) {
    start={x:a.x+WIDTH,y:a.y+offset}; startStub={x:start.x+20,y:start.y};
    end={x:a.x+120,y:a.y}; endStub={x:end.x,y:end.y-25};
  } else if (Math.abs(b.x-a.x) >= WIDTH+30) {
    const direction=b.x>a.x?1:-1;
    start={x:a.x+(direction>0?WIDTH:0),y:a.y+offset};
    end={x:b.x+(direction>0?0:WIDTH),y:b.y+offset};
    startStub={x:start.x+direction*20,y:start.y}; endStub={x:end.x-direction*20,y:end.y};
  } else {
    const direction=b.y>a.y?1:-1;
    start={x:a.x+60+index%3*20,y:a.y+(direction>0?HEIGHT:0)};
    end={x:b.x+60+index%3*20,y:b.y+(direction>0?0:HEIGHT)};
    startStub={x:start.x,y:start.y+direction*20};endStub={x:end.x,y:end.y-direction*20};
  }
  const boxes=Object.values(points).map(p=>({left:p.x-CLEARANCE,right:p.x+WIDTH+CLEARANCE,top:p.y-CLEARANCE,bottom:p.y+HEIGHT+CLEARANCE}));
  const path=findPath(startStub,endStub,boxes);
  return finish([start,...(path||[startStub,{x:startStub.x,y:Math.max(...boxes.map(b=>b.bottom))+30},{x:endStub.x,y:Math.max(...boxes.map(b=>b.bottom))+30},endStub]),end],transition);
}
function findPath(start,end,boxes) {
  const xs=[...new Set([start.x,end.x,4,Math.max(736,...boxes.map(b=>b.right+24)),...boxes.flatMap(b=>[b.left,b.right])])].sort((a,b)=>a-b);
  const ys=[...new Set([start.y,end.y,40,Math.max(...boxes.map(b=>b.bottom))+30,...boxes.flatMap(b=>[b.top,b.bottom])])].sort((a,b)=>a-b);
  const blocked=(a,b)=>boxes.some(r=>a.x===b.x ? a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom : a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right);
  const key=(x,y)=>y*xs.length+x, startKey=key(xs.indexOf(start.x),ys.indexOf(start.y)),endKey=key(xs.indexOf(end.x),ys.indexOf(end.y));
  const distance=new Map([[startKey,0]]),previous=new Map(),open=new Set([startKey]);
  const point=id=>({x:xs[id%xs.length],y:ys[Math.floor(id/xs.length)]});
  while(open.size) {
    let current,score=Infinity;
    for(const id of open){const p=point(id),f=distance.get(id)+Math.abs(p.x-end.x)+Math.abs(p.y-end.y);if(f<score){score=f;current=id;}}
    if(current===endKey){const path=[];for(let id=current;id!==undefined;id=previous.get(id))path.unshift(point(id));return path;}
    open.delete(current);const x=current%xs.length,y=Math.floor(current/xs.length),a=point(current);
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(nx<0||ny<0||nx>=xs.length||ny>=ys.length)continue;
      const next=key(nx,ny),b=point(next);if(blocked(a,b))continue;
      const candidate=distance.get(current)+Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
      if(candidate<(distance.get(next)??Infinity)){distance.set(next,candidate);previous.set(next,current);open.add(next);}
    }
  }
  return null;
}
function finish(input,transition) {
  const points=input.filter((p,i)=>!i||!same(p,input[i-1]));
  const simple=points.filter((p,i)=>!i||i===points.length-1||!((points[i-1].x===p.x&&p.x===points[i+1].x)||(points[i-1].y===p.y&&p.y===points[i+1].y)));
  let label={x:simple[0].x,y:simple[0].y-9,anchor:"middle"},longest=-1;
  for(let i=1;i<simple.length;i++){
    const a=simple[i-1],b=simple[i],horizontal=a.y===b.y,length=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
    const priority=length+(horizontal?100:0);
    if(priority>longest){longest=priority;label={x:(a.x+b.x)/2+(horizontal?0:8),y:(a.y+b.y)/2-(horizontal?9:0),anchor:horizontal?"middle":"start"};}
  }
  return {id:transition.id,d:simple.map((p,i)=>`${i?"L":"M"}${p.x},${p.y}`).join(" "),points:simple,label,maxX:Math.max(...simple.map(p=>p.x),label.x+70),maxY:Math.max(...simple.map(p=>p.y),label.y+15)};
}
