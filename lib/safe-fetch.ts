import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { HttpError } from './validation';
export type ExternalOptions={maxBytes?:number;timeoutMs?:number;contentTypes?:string[];redirects?:number};
export function isPublicAddress(address:string) {
 try {let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&(ip as ipaddr.IPv6).isIPv4MappedAddress())ip=(ip as ipaddr.IPv6).toIPv4Address();
 return ip.range()==='unicast';}catch{return false;}
}
export async function validateExternalUrl(value:string,resolve=lookup) {
 let url:URL;try{url=new URL(value);}catch{throw new HttpError(400,'URL non valido.');}
 const hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password|| (url.port&&!['80','443'].includes(url.port)) ||
 /(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)||hostname==='metadata.google.internal')
 throw new HttpError(400,'Destinazione non consentita.');
 const records=ipaddr.isValid(hostname)?[{address:hostname,family:ipaddr.parse(hostname).kind()==='ipv4'?4:6}]:await resolve(hostname,{all:true});
 if(!records.length||records.some(r=>!isPublicAddress(r.address)))throw new HttpError(400,'Indirizzo di rete privato o riservato non consentito.');
 return {url,records};
}
export async function safeFetchExternal(value:string,options:ExternalOptions={}) {
 const maxBytes=options.maxBytes??5*1024*1024;const deadline=Date.now()+(options.timeoutMs??15000);
 let target=value;
 for(let hop=0;hop<=(options.redirects??4);hop++){
  const {url,records}=await validateExternalUrl(target);
  const remaining=deadline-Date.now();if(remaining<=0)throw new HttpError(504,'Download scaduto.');
  const response=await new Promise<http.IncomingMessage>((resolve,reject)=>{
   const transport=url.protocol==='https:'?https:http;
   const req=transport.get(url,{agent:false,headers:{accept:options.contentTypes?.join(',')||'*/*','accept-encoding':'identity','user-agent':'Ricettario/6.2'},
    // Pin the DNS result used by this exact connection, including TLS host verification.
    lookup:((_host:any,opts:any,callback:any)=>opts?.all?callback(null,records):callback(null,records[0].address,records[0].family)) as any
   },resolve);
   const timer=setTimeout(()=>req.destroy(new Error('Download timeout')),remaining);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
  if([301,302,303,307,308].includes(response.statusCode||0)){
   const location=response.headers.location;response.destroy();
   if(!location)throw new HttpError(400,'Redirect non valido.');target=new URL(location,url).href;continue;
  }
  if(response.statusCode!==200){response.destroy();throw new HttpError(502,'Contenuto remoto non disponibile.');}
  const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(options.contentTypes&&!options.contentTypes.includes(type)){response.destroy();throw new HttpError(415,'Tipo di contenuto remoto non consentito.');}
  if(Number(response.headers['content-length'])>maxBytes){response.destroy();throw new HttpError(413,'Download troppo grande.');}
  if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();throw new HttpError(415,'Codifica remota non consentita.');}
  const chunks:Buffer[]=[];let size=0;const timer=setTimeout(()=>response.destroy(new Error('Download timeout')),Math.max(1,deadline-Date.now()));
  try {for await(const chunk of response){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>maxBytes)throw new HttpError(413,'Download troppo grande.');chunks.push(bytes);}}
  finally{clearTimeout(timer);response.destroy();}
  return {bytes:Buffer.concat(chunks),contentType:type,url:url.href};
 }
 throw new HttpError(400,'Troppi redirect.');
}
