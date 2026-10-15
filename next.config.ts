import type { NextConfig } from 'next';
const config:NextConfig={
 turbopack:{root:process.cwd()},
 outputFileTracingIncludes:{'/api/admin/migrations':['./database/migrations/*.sql']},
 outputFileTracingExcludes:{'/*':['./.env','./.env.*','./db-connect-test.cjs','./releases/**/*','./test-results/**/*','./.git/**/*']},
 poweredByHeader:false
};
export default config;
