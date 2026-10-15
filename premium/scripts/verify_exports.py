"""Opens every sample .xlsx/.pdf in real software. Usage: python3 scripts/verify_exports.py <folder>
Needs openpyxl, LibreOffice (soffice), qpdf and pdftotext (poppler). Exits non-zero on any failure."""
import glob, os, subprocess, sys, tempfile
from openpyxl import load_workbook

folder = sys.argv[1]
fails = 0
def bad(msg):
    global fails; fails += 1; print("FAIL", msg)

for f in sorted(glob.glob(os.path.join(folder, "*.xlsx"))):
    name = os.path.basename(f)
    try:
        wb = load_workbook(f)  # formulas as stored
        if not name.startswith(("records-", "analysis-")) and "Summary" not in wb.sheetnames: bad(f"{name}: sheets {wb.sheetnames}")
        if name.startswith("records-") and wb.sheetnames != ["Read me", "Customers", "Products", "Jobs", "Saved calculations"]: bad(f"{name}: sheets {wb.sheetnames}")
        if name.startswith("analysis-") and len(wb.sheetnames) != 7: bad(f"{name}: sheets {wb.sheetnames}")
        for ws in wb:
            for row in ws.iter_rows():
                for c in row:
                    if c.data_type == "f": bad(f"{name}: {ws.title}!{c.coordinate} is a formula: {c.value!r}")
        nums = sum(1 for ws in wb for row in ws.iter_rows() for c in row if isinstance(c.value, (int, float)))
        if nums == 0 and name != "records-empty.xlsx": bad(f"{name}: no numeric cells")
    except Exception as e:
        bad(f"{name}: openpyxl {e}")
    with tempfile.TemporaryDirectory() as d:
        r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", d, f], capture_output=True, text=True, timeout=180)
        if r.returncode != 0 or not glob.glob(os.path.join(d, "*.pdf")): bad(f"{name}: LibreOffice could not open it: {r.stderr[:200]}")
    print("ok  ", name)

for f in sorted(glob.glob(os.path.join(folder, "*.pdf"))):
    name = os.path.basename(f)
    q = subprocess.run(["qpdf", "--check", f], capture_output=True, text=True)
    if q.returncode != 0: bad(f"{name}: qpdf {q.stdout[-200:]}{q.stderr[-200:]}")
    t = subprocess.run(["pdftotext", "-layout", f, "-"], capture_output=True, text=True)
    if t.returncode != 0 or "Page 1 of" not in t.stdout or "UnaabzCalc" not in t.stdout: bad(f"{name}: pdftotext missing expected text")
    if "=HYPERLINK" in t.stdout and "hostile" not in name: pass
    print("ok  ", name)
print("FAILED", fails)
sys.exit(1 if fails else 0)
