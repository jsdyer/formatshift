/** Optional one-process server adapter. No secrets; a narrow, identified API client. */
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {MBID,createQueue} from '../web/model.mjs';
export function upstreamURL(raw){
 const u=new URL(raw,'http://localhost');
 if(!/^\/ws\/2\/(artist|release|release-group)(\/[a-f0-9-]{36})?\/?$/i.test(u.pathname))throw new Error('Unsupported endpoint.');
 const parts=u.pathname.replace(/\/$/,'').split('/'),kind=parts[3],id=parts[4];
 const allowed=new Set(['fmt','query','limit','offset','artist','release-group','inc']);
 for(const k of u.searchParams.keys())if(!allowed.has(k))throw new Error('Unsupported parameter.');
 if(id&&!MBID.test(id))throw new Error('Invalid identifier.');
 const q=u.searchParams.get('query');
 if(q&&(kind!=='artist'||id||q.length>240))throw new Error('Invalid artist query.');
 if(!id&&!q&&!['artist','release-group'].some(k=>u.searchParams.has(k)))throw new Error('Choose an artist query or browse identifier.');
 for(const k of ['artist','release-group'])if(u.searchParams.has(k)&&(!MBID.test(u.searchParams.get(k))||kind!=='release'||id))throw new Error('Invalid browse identifier.');
 for(const [k,max] of [['limit',100],['offset',2000]])if(u.searchParams.has(k)&&(!/^\d+$/.test(u.searchParams.get(k))||+u.searchParams.get(k)>max||(k==='limit'&&+u.searchParams.get(k)<1)))throw new Error('Invalid page bounds.');
 if(u.searchParams.has('inc')&&u.searchParams.get('inc')!=='artist-credits+media+labels+release-groups')throw new Error('Unsupported include fields.');
 u.searchParams.set('fmt','json');return 'https://musicbrainz.org'+u.pathname+'?'+u.searchParams;
}
export function createHandler({fetcher=fetch,allowedOrigins=['https://coolcode.ca','https://jsdyer.github.io'],interval=1200}={}){
 const queue=createQueue(Math.max(1100,interval)),cache=new Map();let waiting=0;
 return async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.includes(origin)){res.writeHead(403);res.end('Origin not allowed');return;}
  const headers={'Content-Type':'application/json','Vary':'Origin','Cache-Control':'public, max-age=3600','Access-Control-Allow-Origin':origin||allowedOrigins[0]};
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept'});res.end();return;}
  if(req.method!=='GET'){res.writeHead(405,headers);res.end('{"error":"GET only"}');return;}
  let url;try{url=upstreamURL(req.url);}catch(e){res.writeHead(400,headers);res.end(JSON.stringify({error:e.message}));return;}
  if(cache.has(url)&&Date.now()-cache.get(url).at<3600000){res.writeHead(200,headers);res.end(cache.get(url).body);return;}
  if(waiting>=25){res.writeHead(429,{...headers,'Retry-After':'30'});res.end('{"error":"Queue full; retry later"}');return;}
  waiting++;
  try{const data=await queue(async()=>{const r=await fetcher(url,{headers:{'User-Agent':'CoolCodeFormatShift/1.0 (https://coolcode.ca/formatshift/)','Accept':'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok){const e=new Error('MusicBrainz returned HTTP '+r.status);e.status=r.status;throw e;}return JSON.stringify(await r.json());});if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(url,{at:Date.now(),body:data});res.writeHead(200,headers);res.end(data);}catch(e){res.writeHead(e.status||502,{...headers,'Cache-Control':'no-store'});res.end(JSON.stringify({error:e.message}));}finally{waiting--;}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.PORT||8789);createServer(createHandler()).listen(port,'127.0.0.1',()=>console.log(`Format Shift adapter on 127.0.0.1:${port}. Put behind HTTPS; set web/config.json apiBase to your /ws/2/ endpoint.`));}
