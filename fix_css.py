
import sys

content = open('styles.css', 'r', encoding='utf-8').read()

new_block = '''/* Column widths */
#historyTable th:nth-child(1),
#historyTable td:nth-child(1) { width: 35px; }  /* # */
#historyTable th:nth-child(2),
#historyTable td:nth-child(2) { width: 95px; }  /* Word */
#historyTable th:nth-child(3),
#historyTable td:nth-child(3) { width: 100px; } /* Pronunciation */
#historyTable th:nth-child(4),
#historyTable td:nth-child(4) { width: 75px; }  /* POS */
#historyTable th:nth-child(5),
#historyTable td:nth-child(5) { width: 9%; }    /* Related Topics */
#historyTable th:nth-child(6),
#historyTable td:nth-child(6) { width: 18%; }   /* Meaning */
#historyTable th:nth-child(7),
#historyTable td:nth-child(7) { width: 13%; }   /* AI Mnemonic */
#historyTable th:nth-child(8),
#historyTable td:nth-child(8) { width: 13%; }   /* Example */
#historyTable th:nth-child(9),
#historyTable td:nth-child(9) { width: 10%; }   /* Phrases */
#historyTable th:nth-child(10),
#historyTable td:nth-child(10) { width: 9%; }   /* Synonyms */
#historyTable th:nth-child(11),
#historyTable td:nth-child(11) { width: 9%; }   /* Antonyms */
#historyTable th:nth-child(12),
#historyTable td:nth-child(12) { width: 70px; } /* Source */
#historyTable th:nth-child(13),
#historyTable td:nth-child(13) { width: 75px; } /* Date */
#historyTable th:nth-child(14),
#historyTable td:nth-child(14) { width: 60px; } /* Mastery */
#historyTable th:nth-child(15),
#historyTable td:nth-child(15) { 
    width: 90px; 
    position: sticky; 
    right: 0; 
    background: var(--bg-card); 
    box-shadow: -2px 0 5px rgba(0,0,0,0.05); 
    z-index: 2;
} /* Actions */

#historyTable th:nth-child(15) {
    background: var(--bg-hover);
    z-index: 3;
}
'''

start_idx = content.find('/* Column widths */')
end_idx = content.find('#historyTable td:nth-child(6),')

if start_idx == -1 or end_idx == -1:
    print('Failed to find markers')
    sys.exit(1)

new_content = content[:start_idx] + new_block + '\n' + content[end_idx:]

with open('styles.css', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')

