import pandas as pd
import sys

sys.stdout.reconfigure(encoding='utf-8')

try:
    xls = pd.ExcelFile('Technical & On-Page SEO Audit Workbook RELEASE.xlsx')
    
    # Dump Technical Audit Checklist
    tech_df = pd.read_excel(xls, sheet_name='Technical Audit Checklist')
    tech_df.to_csv('tech_checklist.csv', index=False)
    
    # Dump On-Page Audit Checklist
    onpage_df = pd.read_excel(xls, sheet_name='On-Page Audit Checklist')
    onpage_df.to_csv('onpage_checklist.csv', index=False)
    
    print("Exported checklists to CSV")
except Exception as e:
    print("Error:", e)
