import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /await db\.collection\('employees'\)\.doc\(userRecord\.uid\)\.set\(\{[\s\S]*?lastLogin: null\n\s*\}\);/;
code = code.replace(regex, `await db.collection('employees').doc(userRecord.uid).set({
        uid: userRecord.uid,
        fullName,
        email,
        role,
        department,
        jobTitle,
        employeeCode,
        status: 'active',
        mustChangePassword: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy,
        lastLogin: null
      });
      
      // Audit Log
      await db.collection('audit_logs').add({
        action: 'CREATE_EMPLOYEE',
        targetUserEmail: email,
        performedBy: createdBy || 'SYSTEM',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });`);

fs.writeFileSync('server.ts', code);
