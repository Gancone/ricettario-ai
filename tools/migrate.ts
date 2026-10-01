import { migrateDatabase } from '../lib/migrations';
migrateDatabase().then(result=>console.log(JSON.stringify(result))).catch(error=>{
 console.error(error?.message?.startsWith('DATABASE_URL')?error.message:'Migrazione non completata. Transazione annullata; verificare connessione, privilegi e backup.');process.exitCode=1;
});
