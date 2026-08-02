import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The issue in App.tsx is around line 165
code = code.replace(/    \}, \(error\) => \{\n      console.error\('Realtime requests notification error:', error\);\n    \}\);\n\n        \};\n  \}, \[isAdmin, user\]\);/, `    }, (error) => {
      console.error('Realtime requests notification error:', error);
    });

    return () => {
      unsubRequests();
    };
  }, [isAdmin, user]);`);

fs.writeFileSync('src/App.tsx', code);
