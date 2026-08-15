from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font('helvetica', 'B', 16)
        self.cell(0, 10, 'VocabVault - Installation & Setup Guide', 0, new_x="LMARGIN", new_y="NEXT", align='C')
        self.ln(10)

    def chapter_title(self, title):
        self.set_font('helvetica', 'B', 14)
        self.set_text_color(0, 102, 204)
        self.cell(0, 10, title, 0, new_x="LMARGIN", new_y="NEXT", align='L')
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def chapter_body(self, body):
        self.set_font('helvetica', '', 12)
        self.multi_cell(0, 8, body)
        self.ln(10)

pdf = PDF()
pdf.add_page()

# Chrome Extension
pdf.chapter_title('Part 1: How to Install the Chrome Extension')
ext_body = (
    "1. Download 'vocab-enhancer-extension.zip' from the website.\n"
    "2. Extract/unzip the downloaded file to a folder on your computer.\n"
    "3. Open Google Chrome and type 'chrome://extensions/' in the address bar.\n"
    "4. Turn on 'Developer mode' (toggle switch in the top right corner).\n"
    "5. Click the 'Load unpacked' button that appears in the top left.\n"
    "6. Select the folder where you extracted the zip file.\n"
    "7. VocabVault is now installed! You can pin it to your toolbar."
)
pdf.chapter_body(ext_body)

# Local Development
pdf.chapter_title('Part 2: How to Run the App Locally (For Developers)')
local_body = (
    "HOW TO SETUP FOR LOCAL WEB:\n"
    "1. Download and extract the 'vocab-enhancer-source.zip' (or clone via GitHub).\n"
    "2. Open a terminal (Command Prompt) in that folder and run: npm install\n"
    "3. Create a 'start.bat' file (or run in terminal): npm run dev\n"
    "4. Double click your 'start.bat' to launch the local web server.\n"
    "5. Open your browser and go to http://localhost:5173\n\n"
    "HOW TO UPDATE YOUR LOCAL FOLDER:\n"
    "1. If you used GitHub: Run 'git pull origin master' in your terminal.\n"
    "2. If you downloaded the ZIP: Download the latest source ZIP, extract it, and overwrite your old files.\n"
    "3. Run 'npm install' in case there are new dependencies.\n"
    "4. Double click your 'start.bat' again to restart the server!"
)
pdf.chapter_body(local_body)

# Installing on Another PC
pdf.chapter_title('Part 3: Installing on Another PC')
other_pc_body = (
    "Because VocabVault uses secure Google Sign-In, it must be installed correctly on new PCs to work.\n\n"
    "HOW TO INSTALL ON A NEW PC:\n"
    "1. Transfer the exact same 'vocab-enhancer-extension.zip' to the new PC.\n"
    "2. Extract the zip file into a permanent folder (e.g., inside Documents).\n"
    "3. Open Chrome and navigate to chrome://extensions/.\n"
    "4. Enable 'Developer mode' and click 'Load unpacked'.\n"
    "5. Select the extracted folder.\n"
    "6. Click the extension icon and click Login. You can now sign in with ANY Google Email ID!"
)
pdf.chapter_body(other_pc_body)

# Updating the Extension
pdf.chapter_title('Part 4: Updating the Extension')
update_body = (
    "When you download a new version of the extension, you do not need to uninstall or reinstall it. "
    "Follow these fast steps to update without losing settings or needing to log in again:\n\n"
    "1. Download the latest 'vocab-enhancer-extension.zip'.\n"
    "2. Extract the contents and OVERWRITE the files in your existing extension folder.\n"
    "3. Open Chrome and go to chrome://extensions/.\n"
    "4. Find the VocabVault extension card and click the circular 'Reload' icon.\n"
    "5. The extension is now instantly updated!"
)
pdf.chapter_body(update_body)

pdf.output('VocabVault_Installation_Guide.pdf')
print("PDF generated successfully.")
