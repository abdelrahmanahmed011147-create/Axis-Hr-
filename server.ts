// @ts-nocheck
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize firebase admin
if (!getApps().length) {
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
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to create employee
  app.post('/api/createEmployee', async (req, res) => {
    try {
      const { email, password, fullName, role, department, jobTitle, employeeCode, createdBy } = req.body;
      
      if (!getApps().length) {
        return res.status(500).json({ error: 'Firebase Admin not initialized. Ensure FIREBASE_SERVICE_ACCOUNT env var is set.' });
      }

      // 1. Create user in Firebase Auth
      const userRecord = await getAuth().createUser({
        email,
        password,
        displayName: fullName,
      });

      // 2. Create document in Firestore
      const db = getFirestore();
      await db.collection('employees').doc(userRecord.uid).set({
        uid: userRecord.uid,
        fullName,
        email,
        role,
        department,
        jobTitle,
        employeeCode,
        status: 'active',
        mustChangePassword: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy,
        lastLogin: null
      });
      
      // Audit Log
      await db.collection('audit_logs').add({
        action: 'CREATE_EMPLOYEE',
        targetUserEmail: email,
        performedBy: createdBy || 'SYSTEM',
        timestamp: FieldValue.serverTimestamp()
      });

      res.status(200).json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      console.error('Error creating employee:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
