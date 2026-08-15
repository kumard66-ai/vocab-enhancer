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
    "1. Ensure you have Node.js installed on your machine (download from nodejs.org).\n"
    "2. Download 'vocab-enhancer-source.zip' from the website.\n"
    "3. Extract the zip file to a folder on your computer.\n"
    "4. Open a terminal or command prompt inside that extracted folder.\n"
    "5. Run the command: npm install (This will download all required dependencies).\n"
    "6. Run the command: npm run dev (This will start the local development server).\n"
    "7. Open the displayed Local URL (usually http://localhost:5173) in your web browser."
)
pdf.chapter_body(local_body)

# Installing on Another PC
pdf.chapter_title('Part 3: Installing on Another PC (with any Google Account)')
other_pc_body = (
    "Because VocabVault uses secure Google Sign-In, it must be installed correctly on new PCs to work.\n\n"
    "FOR THE DEVELOPER (Before Sharing):\n"
    "You MUST add your 'key' string (generated from your .pem file) to your manifest.json. "
    "This locks your Extension ID permanently so it matches your Google Cloud Console Client ID everywhere.\n\n"
    "FOR THE USER (On the New PC):\n"
    "1. Transfer the exact same 'vocab-enhancer-extension.zip' to the new PC.\n"
    "2. Extract the zip file into a permanent folder (e.g., inside Documents).\n"
    "3. Open Chrome and navigate to chrome://extensions/.\n"
    "4. Enable 'Developer mode' and click 'Load unpacked'.\n"
    "5. Select the extracted folder.\n"
    "6. Click the extension icon and click Login. You can now sign in with ANY Google Email ID!"
)
pdf.chapter_body(other_pc_body)

pdf.output('VocabVault_Installation_Guide.pdf')
print("PDF generated successfully.")
