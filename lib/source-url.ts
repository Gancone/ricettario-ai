export function normalizeSourceUrl(value:string) {
 if(!value?.trim())return '';
 try {
 const url=new URL(value.trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
 let host=url.host.toLowerCase().replace(/^www\./,'');let pathname=url.pathname.replace(/\/+$/,'')||'/';
 let entries=[...url.searchParams.entries()].filter(([key])=>!/^(utm_.*|fbclid|gclid|igsh|igshid|si|feature|t|start)$/i.test(key));
 if(['youtube.com','m.youtube.com','youtu.be'].includes(host)){
 const id=host==='youtu.be'?pathname.slice(1):/^\/(shorts|embed)\//.test(pathname)?pathname.split('/')[2]:url.searchParams.get('v');
 host='youtube.com';if(id){pathname='/watch';entries=[['v',id]];}}
 const query=new URLSearchParams(entries.sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv))).toString();
 return 'https://'+host+pathname+(query?'?'+query:'');
 }catch{return '';}
}
