import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authCookieHeader,isAppAuthenticated,requireAppAuth,validPassword} from '../lib/app-auth.ts';
import {isPublicAddress,validateExternalUrl} from '../lib/safe-fetch.ts';
import {checksum,encodeChunk,decodeChunk,sealManifest,verifyManifest} from '../lib/backup-format.ts';

test('auth obbligatoria, firma, scadenza, HttpOnly e origine',()=>{
 const previous=process.env.APP_PASSWORD;process.env.APP_PASSWORD='only-a-test-password';
 try{assert.equal(validPassword('wrong'),false);assert.equal(requireAppAuth(new Request('https://example.com/api/recipes')).status,401);
 const cookie=authCookieHeader();assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 const request=new Request('https://example.com/api/recipes',{headers:{cookie}});assert.ok(isAppAuthenticated(request));
 assert.equal(requireAppAuth(new Request(request,{method:'POST',headers:{cookie,origin:'https://other.example'}})).status,403);
 assert.equal(isAppAuthenticated(new Request(request,{headers:{cookie:cookie.replace(/auth=./,'auth=0')}})),false);
 process.env.APP_PASSWORD='';assert.equal(requireAppAuth(request).status,503);
 }finally{if(previous===undefined)delete process.env.APP_PASSWORD;else process.env.APP_PASSWORD=previous;}
});
test('SSRF: IP privati, mapped IPv6, metadata e DNS misto non sono consentiti',async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','192.168.1.1'])assert.equal(isPublicAddress(address),false);
 assert.equal(isPublicAddress('1.1.1.1'),true);
 for(const url of ['file:///x','http://localhost/x','http://user:pass@example.org','http://example.org:123'])await assert.rejects(validateExternalUrl(url));
 await assert.rejects(validateExternalUrl('https://example.org',async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]));
});
test('backup: chunk e manifest corrotti vengono rifiutati',()=>{
 const chunk=encodeChunk([{id:'one',title:'Ricetta'}]);assert.equal(decodeChunk(chunk.bytes,chunk.checksum,1)[0].title,'Ricetta');
 assert.throws(()=>decodeChunk(chunk.bytes,'0'.repeat(64),1));
 const manifest=sealManifest({version:2,id:'backups/test',created_at:'now',recipe_count:1,category_count:0,app_version:'7',reason:'test',suspicious:false,chunks:[{path:'backups/test/recipes-1.json.gz',entity:'recipes',count:1,bytes:chunk.bytes.length,checksum:chunk.checksum}]});
 verifyManifest(manifest);assert.throws(()=>verifyManifest({...manifest,recipe_count:0}));assert.equal(checksum('test').length,64);
});
