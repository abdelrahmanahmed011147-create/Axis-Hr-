import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/import \* as admin from 'firebase-admin';/, "import admin from 'firebase-admin';");

fs.writeFileSync('server.ts', code);
