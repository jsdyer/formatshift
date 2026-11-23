export const FAMILIES = ['Vinyl', 'Cassette', 'CD', 'MiniDisc', 'Digital', 'Other', 'Unspecified'];
export const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const string = (value, max=500) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0,max) : '';
export function parseId(value, kind='release') {
  const input=String(value).trim();
  if(MBID.test(input)) return input.toLowerCase();
  try {const u=new URL(input); const m=u.pathname.match(/^\/(artist|release|release-group)\/([a-f0-9-]+)\/?$/i); if(u.protocol==='https:' && u.hostname==='musicbrainz.org' && m?.[1]===kind && MBID.test(m[2])) return m[2].toLowerCase();} catch {}
  throw new Error(`Enter a valid ${kind} MusicBrainz ID or its musicbrainz.org link.`);
}
export function dateParts(value) {
  const raw=string(value,100), m=raw.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if(!m || +m[1]<1000 || +m[1]>9999) return {raw:'',year:null,precision:'unknown'};
  if(m[2] && (+m[2]<1 || +m[2]>12)) return {raw:'',year:null,precision:'unknown'};
  if(m[3] && (+m[3]<1 || +m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate())) return {raw:'',year:null,precision:'unknown'};
  return {raw, year:+m[1], precision:m[3]?'day':m[2]?'month':'year'};
}
export function family(format) {
  if(!format) return 'Unspecified';
  if(/minidisc/i.test(format)) return 'MiniDisc';
  if(/vinyl/i.test(format)) return 'Vinyl';
  if(/cassette/i.test(format)) return 'Cassette';
  if(/\b(?:CD|SACD|SHM-CD|Blu-spec CD)\b/i.test(format)) return 'CD';
  if(/digital media/i.test(format)) return 'Digital';
  return 'Other';
}
export function normalizeRelease(raw) {
  if(!raw || !MBID.test(raw.id) || !string(raw.title).trim()) throw new Error('A release must have a MusicBrainz ID and title.');
  const media=Array.isArray(raw.media)?raw.media.slice(0,200).map((m,i)=>({position:Number.isInteger(m.position)?m.position:i+1,format:string(m.format,100)||'Unspecified',title:string(m.title),tracks:Number.isInteger(m['track-count'])&&m['track-count']>=0?m['track-count']:null})):[];
  const date=dateParts(raw.date);
  const credit=Array.isArray(raw['artist-credit'])?raw['artist-credit'].map(x=>typeof x==='string'?string(x):string(x.name || x.artist?.name)+string(x.joinphrase)).join(''):'';
  const labels=Array.isArray(raw['label-info'])?raw['label-info'].map(x=>[string(x.label?.name),string(x['catalog-number'])].filter(Boolean).join(' · ')).filter(Boolean):[];
  return {id:raw.id.toLowerCase(),title:string(raw.title),comment:string(raw.disambiguation),artist:credit||'Artist not supplied',date:date.raw,year:date.year,precision:date.precision,country:string(raw.country,20)||'Unknown',status:string(raw.status)||'Unspecified',barcode:string(raw.barcode,80),packaging:string(raw.packaging),groupId:MBID.test(raw['release-group']?.id)?raw['release-group'].id:'',media,formats:[...new Set(media.length?media.map(m=>family(m.format)):['Unspecified'])].sort((a,b)=>FAMILIES.indexOf(a)-FAMILIES.indexOf(b)),labels};
}
export function validateConfig(c) {
  if(!c || c.schemaVersion!==1 || !Array.isArray(c.presets)||c.presets.some(p=>!string(p.label)||!string(p.query))) throw new Error('Invalid presets in config.json.');
  for(const [key,min,max] of [['requestIntervalMs',1100,60000],['pageSize',1,100],['maxLoadedReleases',1,2000],['artistSearchLimit',1,25]]) if(!Number.isInteger(c[key]) || c[key]<min || c[key]>max) throw new Error(`Invalid ${key} in config.json.`);
  const url=new URL(c.apiBase); if(url.protocol!=='https:' || url.username || url.password) throw new Error('API base must use HTTPS.');
  parseId(c.opening?.releaseGroupId,'release-group');
  if(!Array.isArray(c.opening?.releaseIds)||!c.opening.releaseIds.length||c.opening.releaseIds.length>100) throw new Error('Choose 1–100 opening release IDs.');
  c.opening.releaseIds.forEach(x=>parseId(x)); return c;
}
export function requestURL(c,kind,args={}) {
  const url=new URL(kind.replace(/^\//,''),c.apiBase);
  url.searchParams.set('fmt','json');
  for(const [k,v] of Object.entries(args)) if(v!==undefined && v!=='') url.searchParams.set(k,String(v));
  return url.href;
}
export function artistQuery(name) {const n=String(name).trim(); if(!n || n.length>200) throw new Error('Enter an artist name, up to 200 characters.');return `artist:"${n.replace(/([\\"])/g,'\\$1')}"`;}
export function mergePages(current,incoming,max) {
  if(!Array.isArray(incoming)) throw new Error('MusicBrainz did not return a release list.');
  const map=new Map(current.map(r=>[r.id,r]));
  for(const r of incoming) {normalizeRelease(r); if(map.has(r.id)||map.size<max) map.set(r.id,r);}
  return [...map.values()];
}
export function nextOffset(offset,received,total,max) {if(!Number.isInteger(offset)||!Number.isInteger(received)||offset<0||received<0)throw new Error('Invalid page offset.'); const next=offset+received; return received && next<total && next<max?next:null;}
export function filterReleases(releases,{format='',text='',from='',to='',country=''}={}) {
  const needle=text.toLowerCase().trim();
  return releases.filter(r=>(!format||r.formats.includes(format))&&(!needle||`${r.title} ${r.comment} ${r.artist}`.toLowerCase().includes(needle))&&(!from||(r.year!==null&&r.year>=+from))&&(!to||(r.year!==null&&r.year<=+to))&&(!country||r.country===country)).sort((a,b)=>(a.year??10000)-(b.year??10000)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
export function summarize(releases) {
  const formats=FAMILIES.map(name=>({name,count:releases.filter(r=>r.formats.includes(name)).length})).filter(x=>x.count);
  const years=releases.map(r=>r.year).filter(x=>x!==null);
  const decades=[...new Set(years.map(y=>Math.floor(y/10)*10))].sort((a,b)=>a-b).map(d=>({year:d,counts:FAMILIES.map(name=>({name,count:releases.filter(r=>r.year!==null&&Math.floor(r.year/10)*10===d&&r.formats.includes(name)).length})).filter(x=>x.count)}));
  return {formats,decades,unknownDates:releases.filter(r=>r.year===null).length,min:years.length?Math.min(...years):null,max:years.length?Math.max(...years):null,media:releases.reduce((n,r)=>n+r.media.length,0)};
}
export function receipt(raw) {
  if(raw?.schemaVersion!==1||!Array.isArray(raw.releases)||raw.releases.length>2000||!Number.isFinite(Date.parse(raw.capturedAt))) throw new Error('Choose a Format Shift receipt with a capture time and at most 2,000 releases.');
  raw.releases.forEach(normalizeRelease);
  return {schemaVersion:1,title:string(raw.title)||'Imported release selection',capturedAt:raw.capturedAt,method:string(raw.method)||'Imported receipt',source:string(raw.source),releases:raw.releases};
}
export function csv(releases) {
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
  const lines=[['Release','Artist','Reported date','Date precision','Country','Formats','Media count','Tracks (known)','Status','Barcode','Labels / catalog numbers','MusicBrainz URL']];
  releases.forEach(r=>lines.push([r.title,r.artist,r.date,r.precision,r.country,r.media.map(m=>m.format).join(' + '),r.media.length,r.media.some(m=>m.tracks===null)?'':r.media.reduce((n,m)=>n+m.tracks,0),r.status,r.barcode,r.labels.join('; '),`https://musicbrainz.org/release/${r.id}`]));
  return lines.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function createQueue(interval,{clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  let chain=Promise.resolve(),last=-Infinity;
  return fn=>{const run=chain.catch(()=>{}).then(async()=>{const delay=Math.max(0,interval-(clock()-last)); if(delay) await sleep(delay);last=clock();return fn();});chain=run;return run;};
}
