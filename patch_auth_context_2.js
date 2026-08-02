import fs from 'fs';
let code = fs.readFileSync('src/context/AuthContext.tsx', 'utf8');

// Add isSuperAdmin to AuthContextType
code = code.replace(
  /isAdmin: boolean;\n\}/,
  "isAdmin: boolean;\n  isSuperAdmin: boolean;\n}"
);

// Add isSuperAdmin to createContext default
code = code.replace(
  /isAdmin: false,\n\}\);/,
  "isAdmin: false,\n  isSuperAdmin: false,\n});"
);

// Update AuthContext.Provider value
code = code.replace(
  /<AuthContext\.Provider value=\{\{ user, profile, loading, isAdmin: isHR \}\}>/,
  "<AuthContext.Provider value={{ user, profile, loading, isAdmin: isHR, isSuperAdmin: isAdmin }}>"
);

fs.writeFileSync('src/context/AuthContext.tsx', code);
