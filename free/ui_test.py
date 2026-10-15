import json, threading, http.server, functools, sys
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.dirname(os.path.abspath(__file__))
HDR={h['key']:h['value'] for h in json.load(open(ROOT+'/vercel.json'))['headers'][0]['headers']}
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for k,v in HDR.items(): self.send_header(k,v)
        super().end_headers()
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8123),functools.partial(H,directory=ROOT))
threading.Thread(target=srv.serve_forever,daemon=True).start()
B='http://127.0.0.1:8123/index.html'
R=[]
def rec(area,case,exp,act,ok=None):
    ok = (str(exp)==str(act)) if ok is None else ok
    R.append((area,case,exp,act,ok))
IDS=['basic','percentage','profit','discount','retail-pricing','target-profit','business-expenses','multiple-products','loan','loan-repayment','import-landed-cost','handwork-pricing','poultry-starter','fish-starter']
with sync_playwright() as p:
    br=p.chromium.launch()
    def newpage(w=1280,h=800):
        ctx=br.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.on('dialog',lambda d: (errs.append('DIALOG '+d.message), d.dismiss()))
        return pg,errs
    def fill(pg,vals):
        for k,v in vals.items(): pg.fill('#f_'+k,v)
    def go(pg,id): pg.goto('about:blank'); pg.goto(B+'#/calc/'+id); pg.wait_for_selector('#cb *')
    def submit(pg): pg.click('button[type=submit]')
    def res(pg): return pg.inner_text('.res')
    pg,errs=newpage()
    pg.goto(B); pg.wait_for_selector('.tile')
    rec('Home','calculator tiles shown',14,pg.locator('.tile').count())
    rec('Home','Free tags',14,pg.locator('.tag:text-is("Free")').count())
    rec('Home','categories (Everyday/Business/Finance/Farming)',4,pg.locator('#cats > h3').count())
    rec('Home','Free plan text says all 14 calculators','All 14 calculators, forever.',pg.inner_text('#pricing .plan >> nth=0 >> p'))
    rec('Brand','logo text','UnaabzCalc',pg.inner_text('.logo'))
    rec('Brand','tagline in hero','Calculate Better. Sell Smarter.',pg.inner_text('.kick'))
    rec('Brand','page title','UnaabzCalc – Free Business Calculators for Nigerian Vendors',pg.title())
    rec('Brand','no leftover "CalcPro" anywhere on page','false',str('CalcPro' in pg.content()).lower())
    for id in IDS:
        go(pg,id); rec('Load',id+' page opens with title','true',str(len(pg.inner_text('#ct'))>3).lower())
    rec('Console','no errors/CSP violations while loading all 14 pages','[]',errs, errs==[])
    # existing calculators
    cases=[('percentage',{'a':'20','b':'150'},['30']),('profit',{'cost':'800','sell':'1000'},['₦200.00','25.00%','20.00%']),('discount',{'price':'10000','pct':'15'},['₦8,500.00','₦1,500.00']),
     ('retail-pricing',{'cost':'5000','expenses':'500','value':'30','discount':'10'},['₦7,150.00','₦6,435.00','23.08%']),('target-profit',{'cost':'500','profit':'100000','fixed':'20000','units':'200'},['₦1,100.00','₦220,000.00']),
     ('loan',{'principal':'1000000','rate':'12','term':'12'},['₦88,848.79','₦66,185.46']),('loan-repayment',{'principal':'1000000','rate':'12','term':'1'},['₦88,848.79','12'])]
    for id,v,exp in cases:
        go(pg,id); fill(pg,v); submit(pg); t=res(pg); rec('Existing: '+id,'realistic input shows '+', '.join(exp),'all found',('all found' if all(e in t for e in exp) else t[:80]))
    go(pg,'profit'); fill(pg,{'cost':'1000','sell':'800'}); submit(pg); rec('Existing: profit','loss shows "Loss" and ₦200.00','true',str('Loss' in res(pg) and '₦200.00' in res(pg)).lower())
    go(pg,'profit'); submit(pg); rec('Existing: profit','empty submit -> inline error, no popup','Please enter a valid cost price.',pg.inner_text('.err'))
    go(pg,'discount'); fill(pg,{'price':'5000','pct':'100'}); submit(pg); rec('Existing: discount','100% discount final price','true',str('₦0.00' in res(pg)).lower())
    go(pg,'loan'); fill(pg,{'principal':'120000','rate':'0','term':'12'}); submit(pg); rec('Existing: loan','zero interest','true',str('₦10,000.00' in res(pg)).lower())
    go(pg,'profit'); fill(pg,{'cost':'800','sell':'1000'}); submit(pg)
    pg.evaluate("navigator.share=async d=>{window.__s=d}"); pg.click('button:text-is("Share result")')
    sh=pg.evaluate('window.__s'); rec('Share','native share sends calculator name + result + brand','true',str(sh is not None and 'Profit Calculator' in sh['text'] and 'Profit: ₦200.00' in sh['text'] and 'UnaabzCalc' in sh['text']).lower())
    pg.evaluate("navigator.share=undefined; Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.__c=t}},configurable:true})"); pg.click('button:text-is("Share result")')
    rec('Share','fallback copies result text','true',str('Profit: ₦200.00' in (pg.evaluate('window.__c') or '')).lower()); rec('Share','copy confirmation shown','Result copied. Paste it into WhatsApp or any chat.',pg.inner_text('.res p[role=status]'))
    go(pg,'poultry-starter'); fill(pg,P0:={'count':'101','unitPrice':'1200','feed':'1','price':'1'}); submit(pg); rec('Share','no Share button on the Premium-limit notice','0',pg.locator('button:text-is("Share result")').count())
    go(pg,'profit'); rec('Glossary','profit page has a closed glossary','false',str(pg.evaluate("document.querySelector('#gl details').open")).lower())
    pg.click('#gl summary'); rec('Glossary','opens and explains Markup in plain words','true',str('percentage you add on top of your cost' in pg.inner_text('#gl')).lower())
    rec('Glossary','every calculator except Basic has a glossary','13',sum(1 for i in IDS if (go(pg,i) or True) and pg.locator('#gl details').count()==1))
    go(pg,'basic'); rec('Glossary','Basic has none','0',pg.locator('#gl details').count())
    go(pg,'retail-pricing'); pg.focus('#gl summary'); pg.keyboard.press('Enter'); rec('Glossary','keyboard (Enter) opens it','true',str(pg.evaluate("document.querySelector('#gl details').open")).lower())
    go(pg,'profit'); rec('Icon','SVG, PNG and apple-touch icons present','3',pg.locator('link[rel=icon],link[rel=apple-touch-icon]').count())
    rec('Icon','no leftover naira-symbol favicon','false',str('%E2%82%A6' in pg.content()).lower())
    # basic keyboard
    go(pg,'basic'); pg.keyboard.type('12*3'); pg.keyboard.press('Enter'); rec('Basic','keyboard 12*3 Enter',36,pg.input_value('#disp'))
    pg.keyboard.press('Escape'); pg.keyboard.type('10/0'); pg.keyboard.press('Enter'); rec('Basic','division by zero message','Cannot divide by zero.',pg.inner_text('.err'))
    pg.keyboard.press('Escape'); pg.click('button[aria-label=Delete]'); pg.click('button:text-is("7")'); pg.click('button[aria-label=Add]'); pg.click('button:text-is("5")'); pg.click('button[aria-label=Equals]'); rec('Basic','on-screen keys 7+5',12,pg.input_value('#disp'))
    pg.evaluate('document.activeElement.blur()'); pg.keyboard.press('Escape'); pg.keyboard.type('50+10%'); pg.keyboard.press('Enter'); rec('Basic','keyboard 50+10% = 55',55,pg.input_value('#disp'))
    pg.keyboard.press('Escape'); pg.keyboard.type('200-10%'); pg.keyboard.press('Enter'); rec('Basic','keyboard 200-10% = 180',180,pg.input_value('#disp'))
    # dynamic rows
    go(pg,'business-expenses'); rec('Expenses','default rows',9,pg.locator('.item').count())
    pg.locator('.item').nth(0).locator('input').nth(1).fill('50000'); pg.locator('.item').nth(1).locator('input').nth(1).fill('10000')
    pg.click('button:text-is("Add expense")'); rec('Expenses','add row',10,pg.locator('.item').count())
    pg.locator('.item').nth(9).locator('input').nth(0).fill('Fuel'); pg.locator('.item').nth(9).locator('input').nth(1).fill('5000')
    pg.locator('.item').nth(8).locator('.x').click(); rec('Expenses','remove row',9,pg.locator('.item').count())
    submit(pg); t=res(pg); rec('Expenses','total ₦65,000.00 and yearly ₦780,000.00','true',str('₦65,000.00' in t and '₦780,000.00' in t and 'Fuel' in t).lower())
    go(pg,'multiple-products'); rows=[('A','10','100','150'),('B','5','200','150')]
    for i,r_ in enumerate(rows):
        for j,v in enumerate(r_): pg.locator('.item').nth(i).locator('input').nth(j).fill(v)
    pg.click('button:text-is("Add product")'); rec('Multiple','add product',4,pg.locator('.item').count()); pg.locator('.item').nth(3).locator('.x').click(); rec('Multiple','remove product',3,pg.locator('.item').count())
    submit(pg); t=res(pg); rec('Multiple','total profit ₦250.00, margin 11.11%, 15 units','true',str('₦250.00' in t and '11.11%' in t and '15' in t).lower())
    # new calculators
    go(pg,'loan'); rec('Layout','no empty limit pill on calculators without a limit','false',str(pg.is_visible('#cl')).lower())
    go(pg,'poultry-starter'); rec('Layout','limit pill visible on limited calculators','true',str(pg.is_visible('#cl')).lower())
    go(pg,'import-landed-cost'); rec('Import','limit label shown','Free version: product value up to ₦500,000',pg.inner_text('#cl'))
    fill(pg,{'cost':'3000','qty':'100','shipping':'40000','duties':'25000','clearing':'15000','transport':'8000','bank':'5000','other':'7000','price':'6000'}); submit(pg); t=res(pg)
    rec('Import','₦300,000 import result','true',str(all(x in t for x in ['₦400,000.00','₦4,000.00','₦200,000.00','33.33%','Estimated based on the figures you entered']) ).lower())
    fill(pg,{'cost':'5001'}); submit(pg); rec('Import','above ₦500,000 -> Premium message (not an error)','true',str('Above the Free version limit' in res(pg) and 'mini importers' in res(pg) and pg.inner_text('.err')=='').lower())
    fill(pg,{'cost':'5000'}); submit(pg); rec('Import','exactly ₦500,000 calculates','true',str('₦500,000.00' in res(pg) and 'Above the Free' not in res(pg)).lower())
    fill(pg,{'cost':'','qty':'0'}); submit(pg); rec('Import','empty cost -> inline error','Please enter a valid product cost per unit.',pg.inner_text('.err'))
    go(pg,'poultry-starter'); rec('Poultry','limit label','Free version: up to 100 birds',pg.inner_text('#cl'))
    P={'count':'30','unitPrice':'1200','feed':'90000','med':'6000','bedding':'3000','utilities':'4000','labour':'10000','transport':'2000','other':'1000','price':'7500','mortality':'10'}
    fill(pg,P); submit(pg); t=res(pg); rec('Poultry','30 chicks result','true',str(all(x in t for x in ['₦50,500.00','₦152,000.00','₦5,629.63','10% mortality','Estimated result based on your inputs and assumptions'])).lower())
    fill(pg,{'count':'101'}); submit(pg); rec('Poultry','101 birds -> Premium message','true',str('Above the Free version limit' in res(pg) and 'Advanced farm planning' in res(pg)).lower())
    fill(pg,{'count':'30','mortality':''}); submit(pg); rec('Poultry','empty mortality = 0%, profit ₦73,000.00','true',str('₦73,000.00' in res(pg) and '0% mortality' in res(pg)).lower())
    fill(pg,{'count':'0'}); submit(pg); rec('Poultry','0 birds inline error','Number of birds must be greater than 0.',pg.inner_text('.err'))
    go(pg,'fish-starter'); rec('Fish','limit label','Free version: up to 100 fish',pg.inner_text('#cl'))
    F={'count':'80','unitPrice':'50','feed':'60000','med':'3000','pond':'20000','water':'2000','power':'5000','labour':'10000','transport':'2000','other':'1000','price':'1500','mortality':'15'}
    fill(pg,F); submit(pg); t=res(pg); rec('Fish','80 fingerlings result (loss case)','true',str(all(x in t for x in ['Expected loss','₦5,000.00','₦107,000.00','68'])).lower())
    fill(pg,{'count':'101'}); submit(pg); rec('Fish','101 fish -> Premium message','true',str('Above the Free version limit' in res(pg) and 'Advanced farm planning' in res(pg)).lower())
    fill(pg,{'count':'100'}); submit(pg); rec('Fish','100 fish calculates','true',str('Above the Free' not in res(pg) and 'Expected' in res(pg)).lower())
    # poultry free limit
    go(pg,'poultry-starter'); fill(pg,{**P,'count':'50'}); submit(pg); rec('Poultry','50 birds is free (result shown)','true',str('Expected' in res(pg) and 'Above the Free' not in res(pg)).lower())
    fill(pg,{'count':'100'}); submit(pg); rec('Poultry','100 birds is free (result shown)','true',str('Expected' in res(pg) and 'Above the Free' not in res(pg)).lower())
    fill(pg,{'count':'101'}); submit(pg); rec('Poultry','101 birds shows the Premium notice','true',str('Above the Free version limit' in res(pg) and 'limit of 100 birds' in res(pg)).lower())
    # handwork & service pricing
    go(pg,'handwork-pricing'); rec('Handwork','no usage limit label shown','false',str(pg.is_visible('#cl')).lower())
    rec('Handwork','starts with 2 material rows',2,pg.locator('.item').count())
    rec('Handwork','total-labour box visible, hours hidden','true / false',str(pg.is_visible('#f_labour')).lower()+' / '+str(pg.is_visible('#f_hours')).lower()) if False else rec('Handwork','total-labour box visible, hours hidden','true / false',f"{str(pg.is_visible('#f_labour')).lower()} / {str(pg.is_visible('#f_hours')).lower()}")
    pg.select_option('#f_labourMode','hourly'); rec('Handwork','choosing hourly shows hours + rate, hides total','true / true / false',f"{str(pg.is_visible('#f_hours')).lower()} / {str(pg.is_visible('#f_rate')).lower()} / {str(pg.is_visible('#f_labour')).lower()}")
    rec('Handwork','only the amount profit box visible at first','true / false / false',f"{str(pg.is_visible('#f_amount')).lower()} / {str(pg.is_visible('#f_markup')).lower()} / {str(pg.is_visible('#f_margin')).lower()}")
    mats=[('Ankara fabric','4','3500'),('Lining','2','1200')]
    for i,r_ in enumerate(mats):
        for j,v in enumerate(r_): pg.locator('.item').nth(i).locator('input').nth(j).fill(v)
    pg.click('button:text-is("Add material")'); rec('Handwork','add material row',3,pg.locator('.item').count())
    for j,v in enumerate(('Zip, buttons, thread','1','1500')): pg.locator('.item').nth(2).locator('input').nth(j).fill(v)
    pg.locator('.item').nth(2).locator('.x').click(); rec('Handwork','remove material row',2,pg.locator('.item').count())
    pg.click('button:text-is("Add material")')
    for j,v in enumerate(('Zip, buttons, thread','1','1500')): pg.locator('.item').nth(2).locator('input').nth(j).fill(v)
    fill(pg,{'hours':'8','rate':'1000','transport':'1000','fuel':'500','packaging':'300','wastage':'800','discount':'10'})
    pg.select_option('#f_method','margin'); rec('Handwork','choosing margin shows only the margin box','false / false / true',f"{str(pg.is_visible('#f_amount')).lower()} / {str(pg.is_visible('#f_markup')).lower()} / {str(pg.is_visible('#f_margin')).lower()}")
    fill(pg,{'margin':'30'}); submit(pg); t=res(pg)
    rec('Handwork','tailoring: price, total cost, profit','true',str(all(x in t for x in ['₦40,714.29','₦28,500.00','₦12,214.29','₦17,900.00','₦8,000.00','₦2,600.00'])).lower())
    rec('Handwork','tailoring: margin 30% and markup 42.86% shown separately','true',str('30.00%' in t and '42.86%' in t and 'of selling price' in t and 'on total cost' in t).lower())
    rec('Handwork','tailoring: discount price and profit after','true',str('₦36,642.86' in t and '₦8,142.86' in t).lower())
    rec('Handwork','break-even (minimum) price shown','true',str('Break-even (minimum) price' in t and 'Estimated based on the figures you entered' in t).lower())
    rec('Handwork','Share button present','1',pg.locator('button:text-is("Share result")').count())
    go(pg,'handwork-pricing'); pg.select_option('#f_method','markup'); fill(pg,{'labour':'40000','markup':'25'})
    for i,r_ in enumerate([('Plywood','6','9500'),('Timber','10','1800')]):
        for j,v in enumerate(r_): pg.locator('.item').nth(i).locator('input').nth(j).fill(v)
    submit(pg); t=res(pg); rec('Handwork','carpentry: 25% markup shows price, 20% margin','true',str('₦143,750.00' in t and '₦28,750.00' in t and '₦115,000.00' in t and '20.00%' in t and '25.00%' in t).lower())
    go(pg,'handwork-pricing'); fill(pg,{'labour':'6000','amount':'3000'}); submit(pg); t=res(pg); rec('Handwork','service job without materials: price ₦9,000.00','true',str('₦9,000.00' in t).lower())
    go(pg,'handwork-pricing'); submit(pg); rec('Handwork','empty form -> inline error','Enter at least one cost: materials, labour or other costs.',pg.inner_text('.err'))
    go(pg,'handwork-pricing'); fill(pg,{'labour':'5000'}); submit(pg); rec('Handwork','profit left empty -> inline error, focus in visible box','Please enter a valid desired profit amount. / f_amount',pg.inner_text('.err')+' / '+pg.evaluate('document.activeElement.id'))
    go(pg,'handwork-pricing'); fill(pg,{'labour':'abc','amount':'1'}); submit(pg); rec('Handwork','invalid labour text -> inline error','Please enter a valid labour cost.',pg.inner_text('.err'))
    go(pg,'handwork-pricing'); fill(pg,{'labour':'5000','amount':'1000','discount':'50'}); submit(pg); rec('Handwork','big discount warns about selling below cost','true',str('Warning: after this discount you would charge less than your total cost' in res(pg)).lower())
    # currency
    go(pg,'profit'); fill(pg,{'cost':'800','sell':'1000'}); submit(pg); pg.select_option('#cur','USD'); rec('Currency','USD re-renders existing result','true',str('$200.00' in res(pg)).lower())
    pg.select_option('#cur','GBP'); rec('Currency','GBP','true',str('£200.00' in res(pg)).lower()); pg.select_option('#cur','EUR'); rec('Currency','EUR','true',str('€200.00' in res(pg)).lower())
    go(pg,'import-landed-cost'); pg.select_option('#cur','EUR'); fill(pg,{'cost':'3000','qty':'10'}); submit(pg); rec('Currency','import calculator in EUR asks for NGN','The Free version of this calculator works in Naira (NGN). Please switch the currency to NGN.',pg.inner_text('.err'))
    pg.select_option('#cur','NGN'); submit(pg); rec('Currency','back to NGN calculates','true',str('₦' in res(pg)).lower())
    rec('Console','no errors/dialogs during all interaction tests','[]',errs,errs==[])
    # keyboard accessibility
    go(pg,'profit'); pg.keyboard.press('Tab'); 
    seq=[]
    pg.focus('body')
    for _ in range(14):
        pg.keyboard.press('Tab'); seq.append(pg.evaluate("document.activeElement.id||document.activeElement.tagName+':'+(document.activeElement.textContent||'').slice(0,12)"))
    rec('Keyboard','Tab reaches cost, sell, Calculate, Reset','true',str(all(x in seq for x in ['f_cost','f_sell']) and any('Calculate' in x for x in seq) and any('Reset' in x for x in seq)).lower())
    pg.focus('#f_cost'); o=pg.evaluate("getComputedStyle(document.activeElement).outlineStyle+' '+getComputedStyle(document.activeElement).outlineWidth"); pg.keyboard.press('Tab'); pg.keyboard.press('Shift+Tab')
    o=pg.evaluate("getComputedStyle(document.activeElement).outlineStyle+' '+getComputedStyle(document.activeElement).outlineWidth"); rec('Keyboard','visible focus outline','solid 3px',o)
    pg.fill('#f_cost','800'); pg.fill('#f_sell','1000'); pg.press('#f_sell','Enter'); rec('Keyboard','Enter submits form','true',str('₦200.00' in res(pg)).lower())
    rec('Keyboard','result region is live (role=status)','status',pg.get_attribute('.res','role'))
    rec('Keyboard','inline error is role=alert','alert',pg.get_attribute('.err','role'))
    # responsive
    for w,name in [(360,'small phone'),(412,'large phone'),(768,'tablet'),(1280,'laptop'),(1920,'desktop')]:
        pg2,e2=newpage(w,800); bad=[]
        pg2.goto(B); pg2.wait_for_selector('.tile')
        if pg2.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'): bad.append('home')
        for id in IDS:
            go(pg2,id)
            if pg2.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'): bad.append(id)
        rec('Responsive',f'{name} ({w}px): no sideways page scroll on home + 14 calculators','[]',bad,bad==[]); pg2.context.close()
    pg3,e3=newpage(360,740); go(pg3,'loan-repayment'); fill(pg3,{'principal':'1000000','rate':'12','term':'3'}); pg3.select_option('#f_freq','weekly'); submit(pg3)
    rec('Loan table 360px','weekly 3 years = 156 rows','156',pg3.locator('tbody tr').count())
    rec('Loan table 360px','page does not scroll sideways','false',str(pg3.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth')).lower())
    rec('Loan table 360px','table box scrolls inside itself, keyboard focusable','true',str(pg3.evaluate("(()=>{const e=document.querySelector('.tw');return e.scrollWidth>=e.clientWidth&&e.getAttribute('tabindex')==='0'})()")).lower())
    rec('Loan table 360px','last balance is ₦0.00','₦0.00',pg3.locator('tbody tr').last.locator('td').last.inner_text()); rec('Console','loan table page clean','[]',e3,e3==[])
    pg3.screenshot(path='/tmp/bt/loan360.png')
    pg4,e4=newpage(1280,800); pg4.goto(B); pg4.wait_for_selector('.tile'); pg4.screenshot(path='/tmp/bt/home.png')
    # headers actually served
    rr=pg4.request.get(B); rec('Security headers','CSP/nosniff served and page still works','true',str('script-src' in rr.headers.get('content-security-policy','') and rr.headers.get('x-content-type-options')=='nosniff').lower())
    br.close()
bad=[r for r in R if not r[4]]
print(f'TOTAL {len(R)}  PASS {len(R)-len(bad)}  FAIL {len(bad)}')
for a,c,e,ac,ok in R:
    if not ok: print('FAIL |',a,'|',c,'| expected',e,'| actual',str(ac)[:160])
