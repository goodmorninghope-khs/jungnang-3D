/* 중랑 정비지도 3D — MapLibre + OpenFreeMap 건물 + AWS 지형 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const LAND = '#E8ECEF', GREY = '#8A96A1';
const $ = id => document.getElementById(id);
const stage = $('stage'), pop = $('pop');
const mobile = () => stage.clientWidth <= 720;
const num = n => n ? Math.round(n).toLocaleString('ko-KR') : '';
const HOME = () => mobile()
  ? { center: [127.0958, 37.5918], zoom: 12.55, pitch: 55, bearing: -22 }
  : { center: [127.0958, 37.5918], zoom: 13.45, pitch: 58, bearing: -22 };

/* ───── 구역 도식 (면적 기반 직교 다각형, 실제 경계 아님) ───── */
function rng(s){let h=1779033703;for(const c of s)h=Math.imul(h^c.charCodeAt(0),3432918353),h=h<<13|h>>>19;return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return((h^=h>>>16)>>>0)/4294967296}}
function footprint(d){
  const r=rng(d.id), s=Math.sqrt(d.ar||20000), a=.65+r()*.8;
  const wx=s*Math.sqrt(a), wy=s/Math.sqrt(a), hx=wx/2, hy=wy/2;
  const C=[[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]], k=Math.floor(r()*4);
  const cut=[wx*(.26+r()*.14), wy*(.26+r()*.14)], out=[];
  C.forEach((K,i)=>{
    if(i!==k){out.push(K);return}
    const A=C[(i+3)%4], B=C[(i+1)%4];
    const u=[Math.sign(A[0]-K[0]),Math.sign(A[1]-K[1])], v=[Math.sign(B[0]-K[0]),Math.sign(B[1]-K[1])];
    const lu=u[0]?cut[0]:cut[1], lv=v[0]?cut[0]:cut[1];
    out.push([K[0]+u[0]*lu,K[1]+u[1]*lu],[K[0]+u[0]*lu+v[0]*lv,K[1]+u[1]*lu+v[1]*lv],[K[0]+v[0]*lv,K[1]+v[1]*lv]);
  });
  const rot=(r()-.5)*.5, cs=Math.cos(rot), sn=Math.sin(rot);
  const ring=out.map(([x,y])=>[d.lng+(x*cs-y*sn)/88190, d.lat-(x*sn+y*cs)/111000]);
  ring.push(ring[0]); return ring;
}
function heightM(d){
  if(d.s==='dropped'||d.s==='plan')return 0;
  if(d.s==='stalled')return 6;
  if(d.s==='done'&&d.g>=6)return 0;          // 이미 지어진 건물은 실제 건물로 보임
  const f=d.f||Math.min(35,Math.round(12+Math.sqrt(d.u||(d.ar||20000)/45)*.35));
  return f*3.2;
}
function shade(hex,k){const n=parseInt(hex.slice(1),16);return '#'+[16,8,0].map(b=>Math.round(((n>>b)&255)*k).toString(16).padStart(2,'0')).join('')}
const ZONES={type:'FeatureCollection',features:D.map(d=>{
  const T=TYPES[d.t], c=(d.s==='stalled'||d.s==='dropped')?GREY:T.c;
  return {type:'Feature',id:D.indexOf(d),properties:{id:d.id,t:d.t,s:d.s,c,cd:shade(c,.55),h:heightM(d)},geometry:{type:'Polygon',coordinates:[footprint(d)]}};
})};

/* ───── 필터 상태 ───── */
const fT=new Set(Object.keys(TYPES)), fS=new Set(Object.keys(STATS));
let sel=null, selX=null, showFuture=true, showPOI=true, showTrail=true, BOUNDARY=null, usedFallback=false;
const vis=d=>fT.has(d.t)&&fS.has(d.s);
const userF=()=>['all',['in',['get','t'],['literal',[...fT]]],['in',['get','s'],['literal',[...fS]]]];

/* ───── 지도 ───── */
const map=new maplibregl.Map({container:'map',style:STYLE_URL,...HOME(),maxPitch:75,minZoom:11,attributionControl:{compact:true,customAttribution:'지형 © Mapzen/AWS Terrain Tiles · 경계 © 통계청(southkorea/seoul-maps)'}});
map.touchPitch?.enable?.();
let styleOK=false;
const FALLBACK={version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':LAND}}]};
function useFallback(){
  if(usedFallback)return; usedFallback=true;
  toast('지도 타일을 불러오지 못해 실제 건물·지형 없이 표시합니다. 인터넷 연결을 확인해 주세요.');
  map.setStyle(FALLBACK);
}
const fbTimer=setTimeout(()=>{if(!styleOK)useFallback()},10000);
map.on('error',e=>{if(!styleOK&&!usedFallback&&/style|fetch|Failed/i.test(String(e.error&&e.error.message)))useFallback()});
map.on('style.load',()=>{styleOK=true;clearTimeout(fbTimer);setupLayers()});

function setupLayers(){
  const layers=map.getStyle().layers||[];
  const firstSymbol=(layers.find(l=>l.type==='symbol')||{}).id;
  const hasOMT=!!map.getSource('openmaptiles');

  // 한국어 지명 우선
  layers.filter(l=>l.type==='symbol'&&l.layout&&l.layout['text-field']).forEach(l=>{
    try{map.setLayoutProperty(l.id,'text-field',['coalesce',['get','name:ko'],['get','name'],['get','name:latin']])}catch(e){}
  });

  // 지형
  if(!usedFallback){
    try{
      map.addSource('dem',{type:'raster-dem',tiles:DEM_TILES,encoding:'terrarium',tileSize:256,maxzoom:14});
      map.addSource('dem-hs',{type:'raster-dem',tiles:DEM_TILES,encoding:'terrarium',tileSize:256,maxzoom:14});
      map.addLayer({id:'hillshade',type:'hillshade',source:'dem-hs',paint:{'hillshade-exaggeration':.45,'hillshade-shadow-color':'#5F7361','hillshade-highlight-color':'#FFFFFF','hillshade-accent-color':'#7C8F74'}},firstSymbol);
      map.setTerrain({source:'dem',exaggeration:1.25});
    }catch(e){console.warn(e)}
  }

  // 실제 건물: 높이에 따라 연베이지(빌라·주택) → 무채색 회색(아파트). 사업 색과 겹치지 않게 채도를 뺌
  if(hasOMT){
    layers.filter(l=>l['source-layer']==='building').forEach(l=>map.setLayoutProperty(l.id,'visibility','none'));
    const H=['coalesce',['get','render_height'],['get','height'],7];
    map.addLayer({id:'bld3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:12.5,
      paint:{'fill-extrusion-color':['interpolate',['linear'],H,0,'#EFE9DF',12,'#E6DED2',18,'#DAD7D2',30,'#C9C8C5',60,'#B5B6B7'],
        'fill-extrusion-height':H,'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.9}},firstSymbol);
  }

  // 경계와 구 밖 가림막
  const gu=BOUNDARY.features.find(f=>f.properties.kind==='gu');
  const guRing=gu.geometry.type==='Polygon'?gu.geometry.coordinates[0]:gu.geometry.coordinates[0][0];
  map.addSource('bnd',{type:'geojson',data:BOUNDARY});
  map.addSource('mask',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[[[126.5,37.2],[127.7,37.2],[127.7,38],[126.5,38],[126.5,37.2]],guRing.slice().reverse()]}}});
  if(usedFallback)map.addLayer({id:'gu-fill',type:'fill',source:'bnd',filter:['==',['get','kind'],'gu'],paint:{'fill-color':'#FBFCFC'}});
  map.addLayer({id:'mask',type:'fill',source:'mask',paint:{'fill-color':LAND,'fill-opacity':usedFallback?1:.55}},firstSymbol);
  map.addLayer({id:'dong-line',type:'line',source:'bnd',filter:['==',['get','kind'],'dong'],paint:{'line-color':'#6B7680','line-width':1,'line-opacity':.55,'line-dasharray':[2,2]}},firstSymbol);
  map.addLayer({id:'gu-line',type:'line',source:'bnd',filter:['==',['get','kind'],'gu'],paint:{'line-color':'#1B2430','line-width':2.4,'line-opacity':.7}},firstSymbol);

  // 정비구역
  map.addSource('zones',{type:'geojson',data:ZONES});
  map.addLayer({id:'z-fill',type:'fill',source:'zones',paint:{'fill-color':['get','c'],'fill-opacity':.22}});
  map.addLayer({id:'z-line',type:'line',source:'zones',paint:{'line-color':['get','c'],'line-width':2,'line-opacity':.9}});
  map.addLayer({id:'z-line-dash',type:'line',source:'zones',paint:{'line-color':['get','c'],'line-width':2,'line-opacity':.9,'line-dasharray':[2,1.5]}});
  map.addLayer({id:'z-vol',type:'fill-extrusion',source:'zones',paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':0,'fill-extrusion-opacity':.88,'fill-extrusion-vertical-gradient':false}});
  map.addLayer({id:'z-ghost',type:'fill-extrusion',source:'zones',paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':0,'fill-extrusion-opacity':.36,'fill-extrusion-vertical-gradient':false}});
  map.addLayer({id:'z-sel',type:'fill-extrusion',source:'zones',paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':0,'fill-extrusion-opacity':.96,'fill-extrusion-vertical-gradient':false}});
  map.addLayer({id:'z-cap',type:'fill-extrusion',source:'zones',paint:{'fill-extrusion-color':['get','cd'],'fill-extrusion-height':['+',['get','h'],1.2],'fill-extrusion-base':['get','h'],'fill-extrusion-opacity':.95,'fill-extrusion-vertical-gradient':false}});
  map.addLayer({id:'z-sel-line',type:'line',source:'zones',paint:{'line-color':'#1B2430','line-width':3}});
  // 중랑동행길: 흰 길에 짙은 테두리 (사업 색과 겹치지 않는 '길' 표기)
  map.addSource('trail',{type:'geojson',data:TRAIL_GJ});
  const TS=s=>['==',['get','s'],s];
  map.addLayer({id:'tr-case',type:'line',source:'trail',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0F172A','line-width':['interpolate',['linear'],['zoom'],12,4,16,9],'line-opacity':['case',TS('plan'),.55,.9]}});
  map.addLayer({id:'tr-done',type:'line',source:'trail',filter:TS('done'),layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':['interpolate',['linear'],['zoom'],12,2,16,5]}});
  map.addLayer({id:'tr-fix',type:'line',source:'trail',filter:TS('fix'),paint:{'line-color':'#FFD23F','line-width':['interpolate',['linear'],['zoom'],12,2,16,5],'line-dasharray':[1.6,1]}});
  map.addLayer({id:'tr-plan',type:'line',source:'trail',filter:TS('plan'),layout:{'line-cap':'round'},paint:{'line-color':'#FFFFFF','line-width':['interpolate',['linear'],['zoom'],12,1.5,16,3.5],'line-dasharray':[.2,1.8]}});
  map.addLayer({id:'tr-hit',type:'line',source:'trail',paint:{'line-color':'#000','line-width':18,'line-opacity':0}});
  // 관계선: 선택한 사업·시장·명소·길에서 가까운 곳까지
  map.addSource('rel',{type:'geojson',data:EMPTY});
  map.addLayer({id:'rel-ring',type:'line',source:'rel',filter:['==',['get','k'],'ring'],paint:{'line-color':'#0F172A','line-width':1.5,'line-opacity':.6,'line-dasharray':[3,2]}});
  map.addLayer({id:'rel-line',type:'line',source:'rel',filter:['==',['get','k'],'link'],layout:{'line-cap':'round'},paint:{'line-color':['get','c'],'line-width':2.5,'line-opacity':.9,'line-dasharray':[1,1.2]}});
  applyFilters();applyOverlay();drawRel();
}

function applyFilters(){
  if(!map.getLayer('z-fill'))return;
  const U=userF(), solid=['in',['get','s'],['literal',['fixed','done']]];
  const S=['==',['get','id'],sel||'__none__'];
  map.setFilter('z-fill',U);
  map.setFilter('z-line',['all',U,solid]);
  map.setFilter('z-line-dash',['all',U,['!',solid]]);
  map.setFilter('z-vol',['all',U,solid,['>',['get','h'],0]]);
  map.setFilter('z-ghost',['all',U,['in',['get','s'],['literal',['pending','stalled']]],['>',['get','h'],0]]);
  map.setFilter('z-sel',['all',U,S,['>',['get','h'],0]]);
  map.setFilter('z-sel-line',['all',U,S]);
  const v=showFuture?'visible':'none';
  ['z-vol','z-ghost','z-sel'].forEach(id=>map.setLayoutProperty(id,'visibility',v));
  map.setFilter('z-cap',['all',U,solid,['>',['get','h'],0]]);
  map.setLayoutProperty('z-cap','visibility',v);
  map.setPaintProperty('z-vol','fill-extrusion-opacity',sel?.3:.88);
  map.setPaintProperty('z-cap','fill-extrusion-opacity',sel?.3:.95);
  map.setPaintProperty('z-ghost','fill-extrusion-opacity',sel?.12:.36);
  map.setPaintProperty('z-fill','fill-opacity',sel?.1:.22);
}

/* ───── 관계: 거리 계산 ───── */
const R_NEAR=1000;   // 걸어서 15분 안팎
const EMPTY={type:'FeatureCollection',features:[]};
const TRAIL_GJ={type:'FeatureCollection',features:TRAIL.map(t=>({type:'Feature',properties:{id:t.id,s:t.s},geometry:{type:'LineString',coordinates:t.p}}))};
const xy=(lng,lat)=>[lng*88190,lat*111000];
function dist(a,b){const A=xy(a[0],a[1]),B=xy(b[0],b[1]);return Math.hypot(A[0]-B[0],A[1]-B[1])}
function toLine(pt,line){ // 점에서 선까지 최단거리와 그 지점
  let best=[Infinity,null];const P=xy(...pt);
  for(let i=0;i<line.length-1;i++){const A=xy(...line[i]),B=xy(...line[i+1]),dx=B[0]-A[0],dy=B[1]-A[1];
    const t=Math.max(0,Math.min(1,((P[0]-A[0])*dx+(P[1]-A[1])*dy)/(dx*dx+dy*dy||1))),Q=[A[0]+t*dx,A[1]+t*dy],d=Math.hypot(P[0]-Q[0],P[1]-Q[1]);
    if(d<best[0])best=[d,[Q[0]/88190,Q[1]/111000]]}
  return best;
}
const ll=d=>[d.lng,d.lat];
const mStr=m=>m<1000?Math.round(m/10)*10+'m':(m/1000).toFixed(1)+'㎞';
const walk=m=>Math.max(1,Math.round(m*1.25/67))+'분';   // 직선거리×1.25, 분속 67m
const POIC={market:'#0F172A',place:'#475569'};
function nearPOI(pt,r=R_NEAR){return POI.map(p=>({p,m:dist(pt,ll(p))})).filter(x=>x.m<=r).sort((a,b)=>a.m-b.m)}
function nearProj(pt,r=R_NEAR){return D.filter(vis).map(d=>({d,m:dist(pt,ll(d))})).filter(x=>x.m<=r).sort((a,b)=>a.m-b.m)}
function nearTrail(pt){let b={m:Infinity};TRAIL.forEach(t=>{const [m,q]=toLine(pt,t.p);if(m<b.m)b={m,q,t}});return b}
function ring(pt,r){const c=[];for(let i=0;i<=64;i++){const a=i/64*2*Math.PI;c.push([pt[0]+r*Math.cos(a)/88190,pt[1]+r*Math.sin(a)/111000])}return c}
const LN=(a,b,c)=>({type:'Feature',properties:{k:'link',c},geometry:{type:'LineString',coordinates:[a,b]}});
function drawRel(){
  const src=map.getSource&&map.getSource('rel'); if(!src)return;
  const F=[];
  if(sel){const d=D.find(x=>x.id===sel),o=ll(d),c=TYPES[d.t].c;
    if(showPOI)nearPOI(o).slice(0,5).forEach(x=>F.push(LN(o,ll(x.p),c)));
    if(showTrail){const t=nearTrail(o);if(t.m<=R_NEAR)F.push(LN(o,t.q,'#0F172A'))}
  }else if(selX&&selX.k!=='trail'){const p=POI.find(x=>x.id===selX.id),o=ll(p);
    F.push({type:'Feature',properties:{k:'ring'},geometry:{type:'LineString',coordinates:ring(o,R_NEAR)}});
    nearProj(o).forEach(x=>F.push(LN(o,ll(x.d),TYPES[x.d.t].c)));
  }else if(selX&&selX.k==='trail'){const t=TRAIL.find(x=>x.id===selX.id);
    D.filter(vis).forEach(d=>{const [m,q]=toLine(ll(d),t.p);if(m<=500)F.push(LN(q,ll(d),TYPES[d.t].c))});
    POI.forEach(p=>{const [m,q]=toLine(ll(p),t.p);if(m<=500)F.push(LN(q,ll(p),POIC[p.k]))});
  }
  src.setData({type:'FeatureCollection',features:F});
}
function applyOverlay(){
  if(map.getLayer('tr-case'))['tr-case','tr-done','tr-fix','tr-plan','tr-hit'].forEach(id=>map.setLayoutProperty(id,'visibility',showTrail?'visible':'none'));
  POI.forEach(p=>pk[p.id].getElement().style.display=showPOI?'':'none');
  document.querySelectorAll('.trl').forEach(el=>el.style.display=showTrail?'':'none');
}

/* ───── 마커·동 이름 ───── */
const mk={};
D.forEach(d=>{
  const T=TYPES[d.t], b=document.createElement('button');
  b.className='mk '+d.s; b.style.setProperty('--c',T.c);
  b.setAttribute('aria-label',`${d.n}, ${T.n}, ${STATS[d.s]}`);
  b.innerHTML=`<span class="pill"><span class="ic">${d.s==='done'?'✓':T.i}</span><span class="nm">${d.sh}</span><span class="sub">${d.u?' '+num(d.u)+'세대':''}</span></span><span class="tail"></span>`;
  b.addEventListener('click',e=>{e.stopPropagation();stopTour();open(d.id)});
  mk[d.id]=new maplibregl.Marker({element:b,anchor:'bottom'}).setLngLat([d.lng,d.lat]).addTo(map);
});
const pk={};
POI.forEach(p=>{
  const b=document.createElement('button');b.className='pk '+p.k;
  b.setAttribute('aria-label',`${p.n}, ${p.k==='market'?'전통시장':'명소'}`);
  b.innerHTML=`<span class="pb2"><span class="gl">${p.k==='market'?'市':'★'}</span><span class="nm">${p.sh}</span></span>`;
  b.addEventListener('click',e=>{e.stopPropagation();stopTour();openX('poi',p.id)});
  pk[p.id]=new maplibregl.Marker({element:b,anchor:'center'}).setLngLat(ll(p)).addTo(map);
});
TRAIL.forEach(t=>{
  const m=t.p[Math.floor(t.p.length/2)], el=document.createElement('button');
  el.className='trl '+t.s;el.innerHTML=`<i></i>${t.n.replace(/ \(.*\)/,'')}`;
  el.addEventListener('click',e=>{e.stopPropagation();stopTour();openX('trail',t.id)});
  new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(m).addTo(map);
});
function trailKm(t){let s=0;for(let i=0;i<t.p.length-1;i++)s+=dist(t.p[i],t.p[i+1]);return s/1000}
function ringCentroid(r){let A=0,x=0,y=0;for(let i=0;i<r.length-1;i++){const c=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];A+=c;x+=(r[i][0]+r[i+1][0])*c;y+=(r[i][1]+r[i+1][1])*c}A/=2;return[x/(6*A),y/(6*A)]}
function syncMarkers(){
  let rel=null;   // 선택과 관계된 것만 또렷하게
  if(sel){const o=ll(D.find(x=>x.id===sel));rel=new Set([sel,...nearPOI(o).slice(0,5).map(x=>x.p.id)])}
  else if(selX&&selX.k==='poi'){const o=ll(POI.find(x=>x.id===selX.id));rel=new Set([selX.id,...nearProj(o).map(x=>x.d.id)])}
  else if(selX&&selX.k==='trail'){const t=TRAIL.find(x=>x.id===selX.id);rel=new Set([...D.filter(d=>toLine(ll(d),t.p)[0]<=500).map(d=>d.id),...POI.filter(p=>toLine(ll(p),t.p)[0]<=500).map(p=>p.id)])}
  D.forEach(d=>{const el=mk[d.id].getElement();el.style.display=vis(d)?'':'none';el.classList.toggle('sel',sel===d.id);el.classList.toggle('dim',!!rel&&!rel.has(d.id))});
  POI.forEach(p=>{const el=pk[p.id].getElement();el.classList.toggle('sel',selX?.id===p.id);el.classList.toggle('dim',!!rel&&!rel.has(p.id));el.classList.toggle('hl',!!rel&&rel.has(p.id)&&selX?.id!==p.id)});
  drawRel();
}
function zoomClasses(){const z=map.getZoom();stage.classList.toggle('compact',z<14.3);stage.classList.toggle('far',z<15.2);stage.classList.toggle('near',z>15.6)}
map.on('zoom',zoomClasses);

/* ───── 필터 칩 ───── */
function chips(){
  const tr=$('typeRow'), sr=$('statRow');
  const cntT=k=>D.filter(d=>d.t===k&&fS.has(d.s)).length;
  const cntS=k=>D.filter(d=>d.s===k&&fT.has(d.t)).length;
  const allT=fT.size===Object.keys(TYPES).length, allS=fS.size===Object.keys(STATS).length;
  tr.innerHTML=`<button class="chip all" data-k="all" aria-pressed="${allT}">전체 사업</button>`+
    Object.entries(TYPES).map(([k,v])=>`<button class="chip" data-k="${k}" aria-pressed="${fT.has(k)}"><span class="sw" style="background:${v.c}"></span>${v.n} <b>${cntT(k)}</b></button>`).join('');
  sr.innerHTML=`<button class="chip all" data-k="all" aria-pressed="${allS}">전체 상태</button>`+
    Object.entries(STATS).map(([k,v])=>`<button class="chip" data-k="${k}" aria-pressed="${fS.has(k)}" title="${STATDESC[k]}"><span class="st-sw st-${k}"></span>${v} <b>${cntS(k)}</b></button>`).join('');
  tr.onclick=e=>{const c=e.target.closest('.chip');if(c)toggle(fT,c.dataset.k,Object.keys(TYPES))};
  sr.onclick=e=>{const c=e.target.closest('.chip');if(c)toggle(fS,c.dataset.k,Object.keys(STATS))};
  const v=D.filter(vis), u=v.filter(d=>d.s!=='dropped').reduce((a,d)=>a+(d.u||0),0);
  $('meta').textContent=`${ASOF}, ${v.length}곳`;
  $('sum').textContent=u?`공급 계획 약 ${(u/10000).toFixed(1)}만 세대`:'';
  $('listbtn').textContent=`목록 보기 ${v.length}`;
}
function toggle(set,k,all){
  const full=set.size===all.length;
  if(k==='all')all.forEach(x=>set.add(x));
  else if(full){set.clear();set.add(k)}
  else if(set.has(k)){set.delete(k);if(!set.size)all.forEach(x=>set.add(x))}
  else set.add(k);
  if(sel&&!vis(D.find(d=>d.id===sel))){sel=null;pop.classList.remove('on')}
  chips();syncMarkers();applyFilters();renderList();
}

/* ───── 팝오버 ───── */
function open(id,fly=true){
  const d=D.find(x=>x.id===id); if(!d)return;
  sel=id;
  const T=TYPES[d.t], x=d.s==='dropped';
  const steps=STAGES.map((s,i)=>`<div class="stp ${!x&&i<=d.g?'p':''} ${!x&&i===d.g?'cur':''}"><i></i><span>${s}</span></div>`).join('');
  const facts=[['면적',d.ar&&d.ar!==30000?num(d.ar)+'㎡':'확인 필요'],['세대수',d.u?num(d.u):'미정'],['최고층',d.f?d.f+'층':'미정']]
    .map(([k,v])=>`<div class="fact"><small>${k}</small><strong>${v}</strong></div>`).join('');
  const tl=`<ul class="tl"><li><small>최근 ${d.d}</small><strong>${d.e}</strong></li>${d.nx?`<li class="nx"><small>다음${d.nd?' '+d.nd:''}</small><strong>${d.nx}</strong></li>`:''}</ul>`;
  pop.style.setProperty('--c',x?GREY:T.c);
  pop.innerHTML=`<button class="x" aria-label="닫기">×</button>
    <span class="tag" style="--c:${T.c}">${T.n}</span><span class="sbadge">${STATS[d.s]}</span><span class="vbadge ${d.v?'ok':''}">${d.v?'구청 자료 확인':'보도 기준'}</span>
    <h2>${d.n}</h2><p class="addr">${d.a}</p>
    <div class="steps ${x?'x':''}" aria-label="현재 단계: ${x?'무산':STAGES[d.g]}">${steps}</div>
    <div class="facts">${facts}</div>${tl}
    <p class="body">${d.b}</p>
    ${d.pb?`<div class="pb"><b>기부채납 공공시설</b>${d.pb}</div>`:''}
    ${relHTML(d)}
    <p class="src">출처: ${d.src}. 위치는 지번 기준 근사치이고, 구역 모양은 면적을 반영한 도식입니다.</p>`;
  pop.querySelector('.x').onclick=close; bindRel();
  selX=null; pop.classList.add('on'); $('sheet').classList.remove('on');
  syncMarkers(); applyFilters();
  if(fly)map.flyTo({center:[d.lng,d.lat],zoom:Math.max(map.getZoom(),15.6),pitch:60,bearing:map.getBearing(),
    offset:mobile()?[0,-Math.round(stage.clientHeight*.22)]:[-190,40],duration:1400,essential:true});
}
function close(){sel=null;selX=null;pop.classList.remove('on');syncMarkers();applyFilters()}
function relHTML(d){
  const o=ll(d), ps=nearPOI(o).slice(0,5), t=nearTrail(o);
  const li=ps.map(x=>`<li data-x="poi:${x.p.id}"><span class="k ${x.p.k}">${x.p.k==='market'?'市':'★'}</span><b>${x.p.n}</b><em>${mStr(x.m)} · 걸어서 ${walk(x.m)}</em></li>`).join('');
  const tr=t.m<=R_NEAR?`<li data-x="trail:${t.t.id}"><span class="k trail ${t.t.s}"></span><b>중랑동행길 ${t.t.n}</b><em>${mStr(t.m)} · ${t.t.when}</em></li>`:'';
  if(!li&&!tr)return `<div class="rel"><b>반경 1㎞ 안 시장·명소</b><p class="none">가까운 전통시장·명소가 없습니다.</p></div>`;
  return `<div class="rel"><b>반경 1㎞ 안 시장·명소·동행길</b><ul>${li}${tr}</ul></div>`;
}
function bindRel(){pop.querySelectorAll('.rel li[data-x]').forEach(li=>li.onclick=()=>{const [k,id]=li.dataset.x.split(':');openX(k,id)})}
function openX(k,id){
  sel=null; selX={k,id};
  let html='',c='#0F172A',at;
  if(k==='poi'){
    const p=POI.find(x=>x.id===id); at=ll(p); c=POIC[p.k];
    const ns=nearProj(at), u=ns.filter(x=>x.d.s!=='dropped').reduce((a,x)=>a+(x.d.u||0),0), t=nearTrail(at);
    const by={};ns.forEach(x=>{by[x.d.t]=(by[x.d.t]||0)+1});
    const mix=Object.entries(by).map(([t,n])=>`<span class="mx" style="--c:${TYPES[t].c}"><i></i>${TYPES[t].n} ${n}</span>`).join('');
    html=`<span class="tag" style="--c:${c}">${p.k==='market'?'전통시장':'명소'}</span>
      <h2>${p.n}</h2><p class="body">${p.b}</p>
      <div class="facts"><div class="fact"><small>반경 1㎞ 사업</small><strong>${ns.length}곳</strong></div><div class="fact"><small>계획 세대</small><strong>${u?num(u):'—'}</strong></div><div class="fact"><small>동행길까지</small><strong>${mStr(t.m)}</strong></div></div>
      ${p.k==='market'&&u?`<p class="lead">걸어서 15분 거리에 약 ${num(u)}세대가 새로 들어설 계획입니다. 공사 기간의 이주와 입주 뒤의 새 손님, 이 시장 상권이 겪을 두 번의 변화입니다.</p>`:''}
      ${mix?`<div class="mix">${mix}</div>`:''}
      <div class="rel"><b>가까운 정비사업</b><ul>${ns.map(x=>`<li data-x="proj:${x.d.id}"><span class="k" style="background:${TYPES[x.d.t].c}"></span><b>${x.d.n}</b><em>${mStr(x.m)}${x.d.u?' · '+num(x.d.u)+'세대':''}</em></li>`).join('')||'<li class="none">반경 1㎞ 안 사업이 없습니다.</li>'}</ul></div>
      <p class="src">위치는 근사치입니다. 거리는 직선거리, 도보 시간은 직선×1.25로 어림했습니다.</p>`;
  }else{
    const t=TRAIL.find(x=>x.id===id); at=t.p[Math.floor(t.p.length/2)];
    const ds=D.filter(vis).map(d=>({d,m:toLine(ll(d),t.p)[0]})).filter(x=>x.m<=500).sort((a,b)=>a.m-b.m);
    const ps=POI.map(p=>({p,m:toLine(ll(p),t.p)[0]})).filter(x=>x.m<=500).sort((a,b)=>a.m-b.m);
    // 도식 선 길이를 실제 총연장 21㎞에 맞춰 환산
    const tot=TRAIL.reduce((a,x)=>a+trailKm(x),0), km=x=>trailKm(x)*21/tot, byS=s=>TRAIL.filter(x=>x.s===s).reduce((a,x)=>a+km(x),0);
    const bar=['done','fix','plan'].map(s=>`<i class="${s}" style="flex:${byS(s)}"></i>`).join('');
    html=`<span class="tag" style="--c:#0F172A">중랑동행길 21㎞</span><span class="sbadge">${TRAILSTAT[t.s]}</span>
      <h2>${t.n}</h2><p class="addr">${t.when} · 약 ${km(t).toFixed(1)}㎞</p>
      <div class="tbar">${bar}</div>
      <div class="tleg"><span><i class="done"></i>이미 걷는 길 ${byS('done').toFixed(1)}㎞</span><span><i class="fix"></i>정비 ${byS('fix').toFixed(1)}㎞</span><span><i class="plan"></i>새로 이을 길 ${byS('plan').toFixed(1)}㎞</span></div>
      <p class="body">${t.b}</p>
      <div class="rel"><b>길에서 500m 안</b><ul>${ps.map(x=>`<li data-x="poi:${x.p.id}"><span class="k ${x.p.k}">${x.p.k==='market'?'市':'★'}</span><b>${x.p.n}</b><em>${mStr(x.m)}</em></li>`).join('')}${ds.map(x=>`<li data-x="proj:${x.d.id}"><span class="k" style="background:${TYPES[x.d.t].c}"></span><b>${x.d.n}</b><em>${mStr(x.m)}</em></li>`).join('')||(ps.length?'':'<li class="none">가까운 사업·시장이 없습니다.</li>')}</ul></div>
      <p class="src">봉화산·용마산·망우산·중랑천을 잇는 21㎞ 순환 보행길. 류경기 구청장은 2026년 6월 3선 뒤 '3년 안 완공'을 밝혔습니다. 노선은 ${TRAIL_ASOF} 도식이며 구청 확정 노선이 아닙니다. 구간 길이는 도식을 총연장 21㎞에 맞춰 환산한 어림값입니다.</p>`;
  }
  pop.style.setProperty('--c',c);
  pop.innerHTML=`<button class="x" aria-label="닫기">×</button>${html}`;
  pop.querySelector('.x').onclick=close;
  pop.querySelectorAll('.rel li[data-x]').forEach(li=>li.onclick=()=>{const [k2,id2]=li.dataset.x.split(':');k2==='proj'?open(id2):openX(k2,id2)});
  pop.classList.add('on'); $('sheet').classList.remove('on');
  syncMarkers(); applyFilters();
  map.flyTo({center:at,zoom:k==='trail'?14.6:Math.max(Math.min(map.getZoom(),15),14.4),pitch:55,bearing:map.getBearing(),
    offset:mobile()?[0,-Math.round(stage.clientHeight*.22)]:[-190,40],duration:1400,essential:true});
}
map.on('click',e=>{
  const layers=['z-sel','z-vol','z-ghost','z-fill'].filter(l=>map.getLayer(l));
  const f=layers.length?map.queryRenderedFeatures(e.point,{layers}):[];
  const tf=!f.length&&map.getLayer('tr-hit')&&showTrail?map.queryRenderedFeatures(e.point,{layers:['tr-hit']}):[];
  if(f.length){stopTour();open(f[0].properties.id)}else if(tf.length){stopTour();openX('trail',tf[0].properties.id)}else if(sel||selX)close();
});
['z-fill','z-vol','z-ghost','tr-hit'].forEach(l=>{map.on('mouseenter',l,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',l,()=>map.getCanvas().style.cursor='')});

/* ───── 목록 ───── */
function renderList(){
  const b=$('shBody'), v=D.filter(vis);
  $('shTitle').textContent=`사업 목록 ${v.length}곳`;
  if(!v.length){b.innerHTML='<div class="empty">조건에 맞는 사업이 없습니다. 필터를 넓혀 보세요.</div>';return}
  b.innerHTML=Object.keys(STATS).map(s=>{
    const g=v.filter(d=>d.s===s).sort((a,c)=>c.g-a.g||(c.u||0)-(a.u||0)); if(!g.length)return'';
    return `<div class="grp">${STATS[s]} ${g.length}</div>`+g.map(d=>{const T=TYPES[d.t];
      return `<button class="li" data-id="${d.id}" style="--c:${T.c}"><span class="d"></span><span class="n"><b>${d.n}</b><small>${T.n}, ${s==='dropped'?'무산':STAGES[d.g]} 단계${d.nx&&d.nd?`, 다음 ${d.nd}`:''}</small></span><span class="u">${d.u?num(d.u)+'세대':''}</span></button>`}).join('');
  }).join('');
  b.onclick=e=>{const li=e.target.closest('.li');if(li){$('sheet').classList.remove('on');stopTour();open(li.dataset.id)}};
}

/* ───── 컨트롤 ───── */
$('listbtn').onclick=()=>{stopTour();close();$('sheet').classList.add('on')};
$('shClose').onclick=()=>$('sheet').classList.remove('on');
$('zin').onclick=()=>map.zoomIn();
$('zout').onclick=()=>map.zoomOut();
$('north').onclick=()=>map.easeTo({bearing:0,duration:600});
$('home').onclick=()=>{stopTour();close();map.flyTo({...HOME(),duration:1400})};
$('tilt').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);e.currentTarget.textContent=on?'3D':'2D';map.easeTo({pitch:on?58:0,duration:700})};
$('future').onclick=e=>{showFuture=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',showFuture);e.currentTarget.textContent=showFuture?'계획':'지금';applyFilters()};
$('poiBtn').onclick=e=>{showPOI=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',showPOI);applyOverlay();syncMarkers()};
$('trailBtn').onclick=e=>{showTrail=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',showTrail);applyOverlay();syncMarkers()};
$('legX').onclick=()=>$('legend').remove();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){stopTour();close();$('sheet').classList.remove('on')}});
function toast(t){const el=$('toast');el.textContent=t;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),6000)}

/* ───── 동네 투어 ───── */
const fixedN=D.filter(d=>d.s==='fixed'||d.s==='done').length;
const TOUR=[
 {t:'중랑구 한눈에',v:{center:[127.0958,37.5918],zoom:13.3,pitch:58,bearing:-22},
  p:`${D.length}곳 중 ${fixedN}곳이 법적 절차를 마쳤거나 공사 중입니다. 바닥의 베이지색 건물이 지금의 빌라·주택이고, 솟은 색 덩어리가 계획된 높이입니다.`},
 {t:'면목역과 사가정역 사이',v:{center:[127.0908,37.5852],zoom:15.3,pitch:62,bearing:25},
  p:'7호선을 따라 저층 주거지가 가장 촘촘한 곳입니다. 면목7구역(35층, 1,515세대)이 통합심의를 통과했고, 주변으로 모아타운 다섯 곳과 도심복합 두 곳이 겹겹이 이어집니다.'},
 {t:'중랑천 수변, 면목5동',v:{center:[127.0812,37.5822],zoom:15.4,pitch:62,bearing:-55},
  p:'면목8·10구역과 면목5동 152-1 모아타운이 한 덩어리로 계획됩니다. 동부간선도로 지하화와 면목선 신설역을 염두에 둔 수변 단지 구상입니다.'},
 {t:'상봉역과 옛 상봉터미널',v:{center:[127.0905,37.5918],zoom:15.5,pitch:62,bearing:70},
  p:'38년 운영한 터미널 자리에 49층 상봉9구역이 공정률 18%로 올라가고 있습니다. 바로 남쪽 면목본동 저층주거지에서는 도심복합 두 곳이 주민대표회의를 꾸렸습니다.'},
 {t:'중화동',v:{center:[127.0792,37.5992],zoom:15.3,pitch:60,bearing:-20},
  p:'2014년 뉴타운 해제 뒤 오래 멈춰 있던 동네입니다. 중화2동 329-38 모아타운이 통합심의를 통과했고, 중화5구역은 LH와 GS건설이 공공재개발로 추진합니다.'},
 {t:'망우산 자락',v:{center:[127.0995,37.5935],zoom:15.1,pitch:64,bearing:140},
  p:'서일대와 망우역 사이 산자락 저층주거지에 모아타운이 잇따라 관리계획을 받았고, 상봉13구역이 조합설립을 앞두고 있습니다.'},
 {t:'길게 멈춘 곳들',v:{center:[127.0830,37.5815],zoom:14.3,pitch:50,bearing:0},
  p:'면목2동과 용마산역세권 두 지역주택조합은 조합원 모집 뒤 8~9년째 조합을 세우지 못했습니다. 확보한 토지사용권원이 요건(80%)에 한참 못 미치는 20~30% 수준입니다.'},
 {t:'시장과 정비사업',v:{center:[127.0885,37.5870],zoom:15.0,pitch:60,bearing:-10},
  p:'동원·면목·사가정·동부시장, 네 시장이 7호선 1.5㎞ 안에 몰려 있습니다. 시장마다 걸어서 15분 거리에 수천 세대가 새로 들어설 계획입니다. 시장 표시(市)를 누르면 그 배후 단지가 이어집니다.'},
 {t:'중랑동행길 21㎞',v:{center:[127.0925,37.5920],zoom:13.2,pitch:50,bearing:-22},
  p:'봉화산·망우산·용마산과 중랑천을 한 고리로 잇는 길입니다. 흰 선은 지금 걷는 길, 노란 점선은 정비 중인 구간, 흰 점선은 2029년까지 새로 이을 구간입니다.'},
 {t:'신내택지',v:{center:[127.1050,37.6112],zoom:14.9,pitch:60,bearing:-30},
  p:'1990년대 조성된 아파트 단지입니다. 서울시가 올해 지구단위계획 초안을 공개하면서 재건축 밑그림 논의가 시작됐습니다.'}
];
let ti=-1, tTimer=null, tRAF=null;
function goTour(i){
  ti=(i+TOUR.length)%TOUR.length; const s=TOUR[ti];
  clearTimeout(tTimer);cancelAnimationFrame(tRAF);$('tourBar').style.width='0';
  $('tourStep').textContent=`${ti+1} / ${TOUR.length}`;$('tourTitle').textContent=s.t;$('tourText').textContent=s.p;
  $('tour').classList.add('on');
  map.flyTo({...s.v,...(mobile()?{zoom:s.v.zoom-.6}:{}),duration:4200,essential:true});
  map.once('moveend',()=>{
    if(ti<0)return; const t0=performance.now(), DUR=8000;
    const step=t=>{const p=Math.min(1,(t-t0)/DUR);$('tourBar').style.width=(p*100)+'%';if(p<1&&ti>=0)tRAF=requestAnimationFrame(step)};
    tRAF=requestAnimationFrame(step);
    tTimer=setTimeout(()=>{if(ti>=0&&ti<TOUR.length-1)goTour(ti+1)},DUR);
  });
}
function stopTour(){if(ti<0)return;ti=-1;clearTimeout(tTimer);cancelAnimationFrame(tRAF);$('tour').classList.remove('on')}
$('tourBtn').onclick=()=>{close();$('sheet').classList.remove('on');goTour(0)};
$('tourNext').onclick=()=>goTour(ti+1);
$('tourPrev').onclick=()=>goTour(ti-1);
$('tourStop').onclick=stopTour;
map.on('dragstart',()=>{if(ti>=0){clearTimeout(tTimer);cancelAnimationFrame(tRAF)}});

/* ───── 시작 ───── */
fetch('boundary.json').then(r=>r.json()).then(b=>{
  BOUNDARY=b;
  b.features.filter(f=>f.properties.kind==='dong').forEach(f=>{
    const r=f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];
    const el=document.createElement('div');el.className='dongl';el.textContent=f.properties.name;
    new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(ringCentroid(r)).addTo(map);
  });
  if(styleOK&&!map.getSource('zones'))setupLayers();
});
const _setup=setupLayers;
setupLayers=function(){if(!BOUNDARY){const w=setInterval(()=>{if(BOUNDARY){clearInterval(w);if(!map.getSource('zones'))_setup()}},100);return}if(!map.getSource('zones'))_setup()};
chips();syncMarkers();renderList();zoomClasses();
$('typeLeg').innerHTML=Object.values(TYPES).map(v=>`<span style="--c:${v.c}"><i></i>${v.n}</span>`).join('');
