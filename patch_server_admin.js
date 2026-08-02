import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/import admin from 'firebase-admin';/, `import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';`);

code = code.replace(/if \(!admin\.apps\.length\) \{[\s\S]*?\} catch \(error\) \{[\s\S]*?\}\n\}/, `if (!getApps().length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      initializeApp({
        credential: cert(JSON.parse(serviceAccount))
      });
    } else {
      initializeApp();
    }
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}`);

code = code.replace(/if \(!admin\.apps\.length\) \{/g, `if (!getApps().length) {`);
code = code.replace(/admin\.auth\(\)\.createUser/g, `getAuth().createUser`);
code = code.replace(/admin\.firestore\(\)/g, `getFirestore()`);
code = code.replace(/admin\.firestore\.FieldValue\.serverTimestamp\(\)/g, `FieldValue.serverTimestamp()`);

fs.writeFileSync('server.ts', code);
