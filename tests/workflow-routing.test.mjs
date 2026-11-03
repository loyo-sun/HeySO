import test from "node:test";
import assert from "node:assert/strict";
import { routeTransition } from "../shared/workflow-routing.mjs";
const crosses=(a,b,r)=>a.x===b.x ? a.x>r.x+.01&&a.x<r.x+169.99&&Math.max(a.y,b.y)>r.y+.01&&Math.min(a.y,b.y)<r.y+43.99 : a.y===b.y&&a.y>r.y+.01&&a.y<r.y+43.99&&Math.max(a.x,b.x)>r.x+.01&&Math.min(a.x,b.x)<r.x+169.99;
function verify(route,points){
  assert.ok(route);assert.ok(!/NaN|Infinity/.test(route.d));
  for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i];
    assert.ok(a.x===b.x||a.y===b.y,"segments must be orthogonal");
    for(const rect of Object.values(points))assert.equal(crosses(a,b,rect),false,`path crosses a node: ${JSON.stringify({a,b,rect})}`);
  }
  assert.ok(route.points.every(p=>p.x<=route.maxX&&p.y<=route.maxY));
}
test("routing: screenshot regression, raising the target keeps start and return edges outside nodes",()=>{
  for(const activeY of [82,40,180]){
    const points={todo:{x:35,y:100},active:{x:310,y:activeY},done:{x:535,y:210}};
    const edges=[['todo','active'],['active','todo'],['active','done'],['done','active'],['todo','done']];
    const paths=edges.map(([from,to],i)=>{const route=routeTransition({id:String(i),from,to},points,i);verify(route,points);return route.d;});
    assert.equal(new Set(paths).size,edges.length);
  }
});
test("routing: skip transitions avoid intervening states and return routes fit canvas bounds",()=>{
  const points={a:{x:35,y:100},b:{x:275,y:100},c:{x:515,y:100}};
  for(const [from,to] of [['a','c'],['c','a'],['b','a'],['b','c']])verify(routeTransition({id:from+to,from,to},points),points);
});
test("routing: vertical paths, self transitions, global transitions and bottom-edge nodes remain visible",()=>{
  const points={a:{x:35,y:100},b:{x:35,y:220},c:{x:556,y:3800}};
  for(const [from,to] of [['a','b'],['b','a'],['c','c'],['*','c'],['a','c']])verify(routeTransition({id:from+to,from,to},points,2),points);
  assert.ok(routeTransition({id:'loop',from:'c',to:'c'},points).maxX>556+170);
});
