import fs from 'fs';
let code = fs.readFileSync('src/types.ts', 'utf8');

code = code.replace(
  /export type UserRole = 'EMPLOYEE' \| 'HR-MASTER' \| 'GM-MASTER';/,
  "export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE' | 'HR-MASTER' | 'GM-MASTER';"
);

// Add lastLogin and createdBy if missing
if (!code.includes('createdBy?: string')) {
  code = code.replace(
    /createdAt: any;/,
    "createdAt: any;\n  createdBy?: string;\n  lastLogin?: any;\n  uid?: string;"
  );
}

fs.writeFileSync('src/types.ts', code);
