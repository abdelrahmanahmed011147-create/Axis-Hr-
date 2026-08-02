import fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Remove the unsubEmployees block
const unsubEmployeesRegex = /\/\/ 2\. Listen to new employees signing up[\s\S]*?unsubEmployees\(\);\n/g;
code = code.replace(unsubEmployeesRegex, '');

// Clean up the remaining unsubRequests(); since unsubEmployees is gone
code = code.replace(/return \(\) => \{\n\s*unsubRequests\(\);\n\s*\};\n\s*\}, \[isAdmin, user\]\);/g, `return () => {
      unsubRequests();
    };
  }, [isAdmin, user]);`);

// Remove the pending activation block
const pendingActivationRegex = /\/\/ Pending activation block\s*if \(profile\.status !== 'active'\) \{[\s\S]*?\}\s*const renderContent/g;
code = code.replace(pendingActivationRegex, 'const renderContent');

fs.writeFileSync('src/App.tsx', code);
