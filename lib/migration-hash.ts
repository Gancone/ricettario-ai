import {checksum} from './backup-format';
const normalize=(sql:string)=>sql.replace(/\r\n/g,'\n');
export function migrationHash(sql:string){return checksum(normalize(sql));}
export function matchesMigration(sql:string,hash:string){const normalized=normalize(sql);return [checksum(sql),checksum(normalized),checksum(normalized.replace(/\n/g,'\r\n'))].includes(hash);}
