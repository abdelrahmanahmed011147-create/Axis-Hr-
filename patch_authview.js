import fs from 'fs';
let code = fs.readFileSync('src/views/AuthView.tsx', 'utf8');

const regex = /if \(email\.trim\(\)\.toLowerCase\(\) === 'abdelrahmanahmed011147@gmail\.com'\.toLowerCase\(\)\) \{[\s\S]*?\} else \{/g;
code = code.replace(regex, "if (true) {");

code = code.replace(/createUserWithEmailAndPassword, /, "");

fs.writeFileSync('src/views/AuthView.tsx', code);
