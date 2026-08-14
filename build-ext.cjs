const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

async function createZip() {
    try {
        const zip = new AdmZip();
        const distPath = path.join(__dirname, 'dist');
        const outPath = path.join(__dirname, 'dist', 'vocab-enhancer-extension.zip');

        if (!fs.existsSync(distPath)) {
            console.error("dist folder not found. Run npm run build first.");
            process.exit(1);
        }

        console.log(`Zipping ${distPath} to ${outPath}...`);
        
        // Exclude the zip file itself if it accidentally got into dist
        fs.readdirSync(distPath).forEach(file => {
            if (file !== 'vocab-enhancer-extension.zip') {
                const fullPath = path.join(distPath, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    zip.addLocalFolder(fullPath, file);
                } else {
                    zip.addLocalFile(fullPath);
                }
            }
        });

        zip.writeZip(outPath);
        console.log("Extension zip created successfully at " + outPath);
    } catch (err) {
        console.error("Error creating zip:", err);
    }
}

createZip();
