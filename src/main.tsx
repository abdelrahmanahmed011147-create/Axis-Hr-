import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSecurityProtections } from './lib/security';
import { initializeAuthPersistence } from './lib/firebase.ts';

async function main() {
  // Initialize anti-inspect and DevTools protection
  initSecurityProtections();
  
  // Wait for Firebase to be fully initialized with persistence settings
  await initializeAuthPersistence();
  
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
