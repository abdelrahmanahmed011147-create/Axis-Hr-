import fs from 'fs';
let code = fs.readFileSync('src/views/ForcePasswordChangeView.tsx', 'utf8');

if (!code.includes("audit_logs")) {
  code = code.replace(
    /import \{ doc, updateDoc \} from 'firebase\/firestore';/,
    "import { doc, updateDoc, collection, setDoc, serverTimestamp } from 'firebase/firestore';"
  );

  const replaceStr = `await updateDoc(doc(db, 'employees', profile.id), {
        mustChangePassword: false
      });
      await setDoc(doc(collection(db, 'audit_logs')), {
        action: 'CHANGE_PASSWORD',
        targetUserEmail: profile.email,
        performedBy: profile.email,
        timestamp: serverTimestamp()
      });`;
  
  code = code.replace(/await updateDoc\(doc\(db, 'employees', profile\.id\), \{\n\s*mustChangePassword: false\n\s*\}\);/, replaceStr);

  fs.writeFileSync('src/views/ForcePasswordChangeView.tsx', code);
}
