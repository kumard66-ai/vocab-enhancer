const fs = require('fs');
function fixImports(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
        const fullPath = dir + '/' + dirent.name;
        if (dirent.isDirectory()) {
            fixImports(fullPath);
        } else if (dirent.name.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('saveWords()')) {
                if (content.match(/import\s+\{[^}]*saveStateToLocal[^}]*\}\s+from\s+['"]\.\.\/state\.js['"]/)) {
                    content = content.replace(/(import\s+\{[^}]*)(saveStateToLocal)([^}]*\}\s+from\s+['"]\.\.\/state\.js['"])/, '$1$2, saveWords$3');
                    fs.writeFileSync(fullPath, content, 'utf8');
                } else if (content.match(/import\s+\{[^}]*STATE[^}]*\}\s+from\s+['"]\.\.\/state\.js['"]/)) {
                    content = content.replace(/(import\s+\{[^}]*)(STATE)([^}]*\}\s+from\s+['"]\.\.\/state\.js['"])/, '$1$2, saveWords$3');
                    fs.writeFileSync(fullPath, content, 'utf8');
                }
            }
        }
    });
}
fixImports('src');
