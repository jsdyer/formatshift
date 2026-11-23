import {FAMILIES,parseId,normalizeRelease,validateConfig,requestURL,artistQuery,mergePages,nextOffset,filterReleases,summarize,receipt,csv,createQueue} from './model.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const colors={Vinyl:'var(--vinyl)',Cassette:'var(--cassette)',CD:'var(--cd)',MiniDisc:'var(--minidisc)',Digital:'var(--digital)',Other:'var(--other)',Unspecified:'var(--unspecified)'};
let config,opening,current={releases:[]},browse=null,selection=new Set(),busy=false,visible=[];
const cache=new Map(); let queue;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function busyState(value){busy=value;document.querySelectorAll('#search-submit,#load-more,#refresh-opening,#presets button,.artist-option,#import').forEach(b=>b.disabled=value);}
async function run(fn){if(busy)return;busyState(true);try{await fn();}catch(e){status(`${e.message} Your current collection is unchanged. You can open MusicBrainz or import a saved receipt.`,true);}finally{busyState(false);}}
async function pacedFetch(url){
 const operation=async()=>{
  const key='coolcode:formatshift:last-request'; let last=0;try{last=Number(localStorage.getItem(key))||0;}catch{}
  const wait=Math.max(0,Math.min(config.requestIntervalMs,config.requestIntervalMs-(Date.now()-last)));if(wait)await new Promise(r=>setTimeout(r,wait));
  try{localStorage.setItem(key,String(Date.now()));}catch{}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{const r=await fetch(url,{headers:{Accept:'application/json'},credentials:'omit',signal:controller.signal});if(!r.ok)throw new Error(r.status===503||r.status===429?'MusicBrainz is busy or rate-limiting requests. Please wait before retrying.':`MusicBrainz returned HTTP ${r.status}.`);const json=await r.json();if(json.error)throw new Error(String(json.error));return json;}catch(e){if(e.name==='AbortError')throw new Error('The MusicBrainz request timed out.');if(e instanceof TypeError)throw new Error('MusicBrainz could not be reached from this browser.');throw e;}finally{clearTimeout(timeout);}
 };
 return navigator.locks?navigator.locks.request('coolcode:formatshift:musicbrainz',operation):operation();
}
async function api(kind,args){const url=requestURL(config,kind,args);if(cache.has(url))return cache.get(url);status('Looking up MusicBrainz metadata…');const data=await queue(()=>pacedFetch(url));if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(url,data);return data;}
function sourceLink(url){$('source-search').href=url;$('source-search').hidden=false;}
function resetFilters(){for(const id of ['filter-text','filter-format','filter-country','filter-from','filter-to'])$(id).value='';}
function setCollection(data,mode){current=receipt(data);selection.clear();resetFilters();$('collection-mode').textContent=mode;const countries=[...new Set(current.releases.map(normalizeRelease).map(r=>r.country))].sort();$('filter-country').replaceChildren(new Option('All countries',''),...countries.map(c=>new Option(c==='XW'?'Worldwide (XW)':c,c)));render();}
function render(){
 const releases=current.releases.map(normalizeRelease);
 visible=filterReleases(releases,{format:$('filter-format').value,text:$('filter-text').value,from:$('filter-from').value,to:$('filter-to').value,country:$('filter-country').value});
 const s=summarize(visible),time=new Date(current.capturedAt).toLocaleString(undefined,{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 $('collection-title').textContent=current.title;
 $('coverage').textContent=`${current.releases.length.toLocaleString()} loaded editions${browse?.total!==undefined?` of ${browse.total.toLocaleString()} reported by MusicBrainz`: ' · selected records, not the whole catalogue'} · captured ${time} UTC`;
 $('provenance').textContent=`Current collection: ${current.method} Capture: ${current.capturedAt}.`;
 $('metrics').replaceChildren(...[[visible.length,'editions in this view'],[s.formats.length,'format families'],[s.min===null?'—':`${s.min}–${s.max}`,'reported year range'],[s.media,'individual media']].map(([v,label])=>{const d=el('div',undefined,'metric');d.append(el('strong',String(v)),el('span',label));return d;}));
 $('legend').replaceChildren(...s.formats.map(f=>{const n=el('span',undefined,'legend-item');const sw=el('i',undefined,'swatch');sw.style.background=colors[f.name];n.append(sw,document.createTextNode(`${f.name} · ${f.count}`));return n;}));
 const peak=Math.max(1,...s.decades.map(d=>d.counts.reduce((n,f)=>n+f.count,0)));
 $('timeline').replaceChildren(...s.decades.map(d=>{const row=el('div',undefined,'timeline-row');row.append(el('span',`${d.year}s`));const track=el('div',undefined,'bar-track');for(const f of d.counts){const b=el('span',String(f.count),'bar-part');b.style.width=`${f.count/peak*100}%`;b.style.background=colors[f.name];b.title=`${d.year}s · ${f.name}: ${f.count} editions`;b.setAttribute('aria-label',b.title);track.append(b);}row.append(track);return row;}));
 $('chart-note').textContent=s.unknownDates?`${s.unknownDates} edition(s) have no usable date and are omitted from the decade chart.`:s.decades.length?'Each edition is counted once per format family it contains.':'No dated editions match these filters.';
 $('edition-count').textContent=`${visible.length} edition${visible.length===1?'':'s'} in view`;
 $('editions').replaceChildren(...visible.map(renderEdition));if(!visible.length)$('editions').append(el('p','No editions match these filters. Reset them to see the loaded collection.','empty'));
 $('load-more').hidden=!browse || browse.next===null;
 $('load-more').textContent=`Load next ${config.pageSize} editions`;
 $('refresh-opening').hidden=current.title!==opening.title||!!browse;
 $('page-note').textContent=browse?(browse.next===null?(browse.total>current.releases.length?`Stopped at the configured ${config.maxLoadedReleases}-edition limit or the end of available pages. Narrow your search with a release-group ID.`:'All editions returned by this browse query are loaded.'):`Only ${current.releases.length} editions are loaded. More pages can change the chart.`):'Search any artist or paste a release / release-group ID above to explore beyond this selection.';
 renderComparison();
}
function renderEdition(r){const card=el('article',undefined,'edition');card.dataset.release=r.id;const f=r.formats[0]||'Unspecified';const art=el('div',({Vinyl:'LP',Cassette:'TAPE',CD:'CD',MiniDisc:'MD',Digital:'FILE'})[f]||'MIX',`format-art ${f}`);art.setAttribute('aria-hidden','true');const body=el('div');body.append(el('h4',r.title),el('p',r.artist,'artist'));if(r.comment)body.append(el('p',r.comment));body.append(el('p',`${r.date||'Date unknown'}${r.precision==='month'?' · month only':r.precision==='year'?' · year only':''} / ${r.country==='XW'?'Worldwide':r.country}`));const badges=el('div',undefined,'badges');for(const m of [...new Set(r.media.map(m=>m.format))])badges.append(el('span',m,'badge'));body.append(badges);const bottom=el('div',undefined,'edition-bottom'),link=el('a','Source record ↗');link.href=`https://musicbrainz.org/release/${r.id}`;link.target='_blank';link.rel='noopener';const label=el('label',undefined,'compare-check'),box=document.createElement('input');box.type='checkbox';box.checked=selection.has(r.id);box.setAttribute('aria-label',`Compare ${r.title}, ${r.date||'date unknown'}, ${r.media.map(m=>m.format).join(' + ')}`);box.addEventListener('change',()=>{if(box.checked){if(selection.size===2){box.checked=false;status('Two editions are already selected. Clear one to choose another.');return;}selection.add(r.id);}else selection.delete(r.id);renderComparison();});label.append(box,document.createTextNode('Compare'));bottom.append(link,label);body.append(bottom);card.append(art,body);return card;}
function renderComparison(){const selected=current.releases.map(normalizeRelease).filter(r=>selection.has(r.id));$('comparison-help').textContent=selected.length===2?'Two editions side by side. Dates are preserved exactly as supplied.':`${selected.length? 'One edition selected. Choose one more.':'Choose two editions above to compare their format, reported date, labels and media.'}`;$('compare-cards').replaceChildren(...selected.map(r=>{const card=el('article',undefined,'compare-card');card.append(el('h4',r.title),el('p',r.comment||r.artist));const dl=el('dl');for(const [k,v] of [['Date',`${r.date||'Unknown'} (${r.precision})`],['Country',r.country],['Status',r.status],['Packaging',r.packaging||'Not supplied'],['Barcode',r.barcode||'Not supplied'],['Labels',r.labels.join('; ')||'Not supplied'],['MBID',r.id]])dl.append(el('dt',k),el('dd',v));card.append(dl);const list=el('ul');r.media.forEach(m=>list.append(el('li',`Medium ${m.position}: ${m.format}${m.title?` · ${m.title}`:''} · ${m.tracks===null?'unknown track count':`${m.tracks} tracks`}`)));card.append(list);const link=el('a','Inspect the MusicBrainz edition ↗');link.href=`https://musicbrainz.org/release/${r.id}`;link.target='_blank';link.rel='noopener';card.append(link);return card;}));}
async function browseReleases(kind,id,title,append=false){
 const offset=append?browse.next:0;if(offset===null)return;
 const limit=Math.min(config.pageSize,config.maxLoadedReleases-offset);
 const data=await api('release',{[kind]:parseId(id,kind),inc:'artist-credits+media+labels+release-groups',limit,offset});
 if(!Number.isInteger(data['release-count'])||!Array.isArray(data.releases))throw new Error('MusicBrainz returned an unexpected release response.');
 const raw=mergePages(append?current.releases:[],data.releases,config.maxLoadedReleases);
 const next=nextOffset(offset,data.releases.length,data['release-count'],config.maxLoadedReleases);
 const nextBrowse={kind,id,title,total:data['release-count'],next};
 const result={schemaVersion:1,title,capturedAt:new Date().toISOString(),method:`MusicBrainz API browse by ${kind}; ${raw.length} loaded of ${data['release-count']} reported. No claim to complete historical coverage.`,source:`https://musicbrainz.org/${kind}/${id}`,releases:raw};
 receipt(result);browse=nextBrowse;setCollection(result,'LIVE COLLECTION');sourceLink(`https://musicbrainz.org/${kind}/${id}`);status(`Loaded ${raw.length} edition${raw.length===1?'':'s'}. ${next!==null?'Use Load next to continue.':'The current browse is complete or at its configured limit.'}`);
}
async function search(){const mode=$('search-mode').value,value=$('query').value.trim();$('artist-results').replaceChildren();
 if(mode==='artist'){
  sourceLink(`https://musicbrainz.org/search?query=${encodeURIComponent(value)}&type=artist&method=indexed`);
  const data=await api('artist',{query:artistQuery(value),limit:config.artistSearchLimit});
  if(!Array.isArray(data.artists))throw new Error('MusicBrainz returned an unexpected artist response.');
  const artists=data.artists.filter(a=>a.id&&a.name);
  $('artist-results').replaceChildren(...artists.map(a=>{const button=el('button',undefined,'artist-option');button.type='button';button.append(el('strong',a.name),el('small',[a.disambiguation,a.country,a.type].filter(Boolean).join(' · ')||'MusicBrainz artist'));button.addEventListener('click',()=>run(()=>browseReleases('artist',a.id,a.name)));return button;}));status(artists.length?`Choose the matching artist. Showing ${artists.length} of ${data.count??artists.length} matches.`:'No artist matched. Try a shorter name or a MusicBrainz ID.');
 }else if(mode==='release-group'){const id=parseId(value,mode);await browseReleases('release-group',id,`Release group ${id.slice(0,8)}`);if(current.releases[0]){current.title=`${current.releases[0].title} · ${normalizeRelease(current.releases[0]).artist}`;browse.title=current.title;render();}}
 else{const id=parseId(value);sourceLink(`https://musicbrainz.org/release/${id}`);const data=await api(`release/${id}`,{inc:'artist-credits+media+labels+release-groups'});const r=normalizeRelease(data);browse=null;setCollection({schemaVersion:1,title:`${r.title} · ${r.artist}`,capturedAt:new Date().toISOString(),method:'MusicBrainz API single-release lookup.',source:`https://musicbrainz.org/release/${id}`,releases:[data]},'LIVE EDITION');status('Loaded this exact release edition. Use a release-group ID to compare its other editions.');}
}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('search-form').addEventListener('submit',e=>{e.preventDefault();run(search);});
$('search-mode').addEventListener('change',()=>{$('query-label').textContent=$('search-mode').selectedOptions[0].text;$('query').placeholder=$('search-mode').value==='artist'?'e.g. Sarah McLachlan':'MusicBrainz UUID or source link';});
for(const id of ['filter-text','filter-format','filter-country','filter-from','filter-to'])$(id).addEventListener('input',()=>{if(config&&current.capturedAt)render();});
$('reset-filters').addEventListener('click',()=>{resetFilters();render();});
$('clear-comparison').addEventListener('click',()=>{selection.clear();render();});
$('load-more').addEventListener('click',()=>run(()=>browseReleases(browse.kind,browse.id,browse.title,true)));
$('refresh-opening').addEventListener('click',()=>run(()=>browseReleases('release-group',config.opening.releaseGroupId,config.opening.title)));
$('opening').addEventListener('click',()=>{if(busy)return;browse=null;setCollection(opening,'RETAINED SELECTION');status('Opened the retained edition selection. Use Explore for any artist or Fetch all editions for this album.');});
$('save-csv').addEventListener('click',()=>download(csv(visible),'text/csv;charset=utf-8','formatshift-editions.csv'));
$('save-json').addEventListener('click',()=>download(JSON.stringify(current,null,2),'application/json','formatshift-receipt.json'));
$('import').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5*1024*1024)throw new Error('Receipts must be no larger than 5 MB.');const r=receipt(JSON.parse(await f.text()));browse=null;setCollection(r,'IMPORTED RECEIPT');status(`Imported ${r.releases.length} editions locally. No file was uploaded.`);}catch(err){status(`Could not import: ${err.message} Current collection unchanged.`,true);}finally{e.target.value='';}});
try{const responses=await Promise.all([fetch('./config.json'),fetch('./data/opening.json')]);if(responses.some(r=>!r.ok))throw new Error('Could not load local configuration or retained records.');const [c,o]=await Promise.all(responses.map(r=>r.json()));config=validateConfig(c);opening=receipt(o);queue=createQueue(config.requestIntervalMs);$('filter-format').append(...FAMILIES.map(f=>new Option(f,f)));$('presets').replaceChildren(...config.presets.map(p=>{const b=el('button',p.label);b.type='button';b.addEventListener('click',()=>{$('search-mode').value='artist';$('query').value=p.query;$('query-label').textContent='Artist name';run(search);});return b;}));setCollection(opening,'RETAINED SELECTION');status('A retained selection is ready to explore. Search any artist to start your own collection.');}catch(e){status(e.message,true);document.querySelectorAll('button').forEach(b=>b.disabled=true);}
