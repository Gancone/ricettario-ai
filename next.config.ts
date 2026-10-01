import type { NextConfig } from 'next';
const config:NextConfig={
 turbopack:{root:process.cwd()},
 outputFileTracingIncludes:{'/api/admin/migrations':['./database/migrations/*.sql']},
 poweredByHeader:false
};
export default config;
