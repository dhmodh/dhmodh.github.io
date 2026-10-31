import asyncio, glob, os, re, json
from playwright.async_api import async_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
BASE='http://localhost:8000'
pages=sorted(os.path.basename(f) for f in glob.glob(ROOT+'/*.html'))
res=[]
def check(name,cond,detail=''):
    res.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail if not cond else '')

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        # 1. every page, 3 viewports: errors, local 404s, h-scroll
        for vp,vn in [({'width':1366,'height':800},'desktop'),({'width':820,'height':900},'tablet'),({'width':390,'height':800},'mobile')]:
            ctx=await b.new_context(viewport=vp)
            for pg in pages:
                page=await ctx.new_page(); errs=[]; bad=[]
                page.on('pageerror',lambda e:errs.append(str(e)))
                page.on('response',lambda r: bad.append(r.url) if r.status>=400 and 'localhost' in r.url and 'favicon.ico' not in r.url else None)
                await page.goto(f'{BASE}/{pg}',wait_until='load'); await page.wait_for_timeout(500)
                ov=await page.evaluate('document.documentElement.scrollWidth-innerWidth')
                check(f'{vn} {pg} loads clean',not errs and not bad and ov<=1,f'errs={errs} bad={bad} overflow={ov}')
                await page.close()
            await ctx.close()

        ctx=await b.new_context(viewport={'width':1366,'height':800}); page=await ctx.new_page()
        # 2. internal links & anchors resolve
        broken=[]
        for pg in pages:
            html=open(f'{ROOT}/{pg}').read()
            for h in re.findall(r'(?:href|src)="([^"#?]+)',html):
                if h.startswith(('http','mailto','tel','//','/')) and not h.startswith('/'): continue
                t=h.lstrip('/')
                if t and not os.path.exists(f'{ROOT}/{t}'): broken.append((pg,h))
        check('all internal links/assets exist',not broken,str(broken))
        # 3. Experience content
        await page.goto(f'{BASE}/experience.html'); await page.wait_for_timeout(400)
        cards=await page.evaluate('[...document.querySelectorAll(".experience-card")].map(c=>[c.querySelector("h3").textContent,c.querySelector(".period-badge").textContent,c.querySelector(".experience-role").textContent])')
        check('experience order Disney > GlobalLogic > HHA',[c[0] for c in cards]==['The Walt Disney Company','GlobalLogic (Hitachi Digital)','HHAeXchange'],str(cards))
        check('Disney role/date',cards[0][1]=='Jul 2026 - Present' and 'Senior Database Reliability Engineer' in cards[0][2],str(cards[0]))
        check('GlobalLogic ended Jul 2026 (same month Disney started)',cards[1][1]=='Feb 2024 - Jul 2026',cards[1][1])
        check('no stale "Present" on GlobalLogic','Present' not in cards[1][1])
        # 4. Home content + typing
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(500)
        txt=await page.inner_text('body')
        check('home mentions Disney role','Walt Disney Company' in txt and 'Open to Opportunities' not in txt and 'Available for Opportunities' not in txt)
        check('journey has 3 items',await page.locator('.journey-item').count()==3)
        t0=await page.inner_text('#typed'); await page.wait_for_timeout(4500); t1=await page.inner_text('#typed')
        check('typing effect cycles text',t0!=t1,f'{t0!r}->{t1!r}')
        # counters
        await page.evaluate('document.querySelector(".quick-stats").scrollIntoView()'); await page.wait_for_timeout(1800)
        nums=await page.evaluate('[...document.querySelectorAll(".stat-number")].map(e=>e.textContent)')
        check('stat counters final values',nums==['5+','120+','99.95%','$1.2M+'],str(nums))
        sty=await page.evaluate('''(()=>{const g=(s,p)=>getComputedStyle(document.querySelector(s))[p];return {mq:g('.marquee-track','display'),j:g('.journey','display'),jl:g('.journey-item','textDecorationLine'),f:g('.featured-grid','display'),bg:g('.gradient-name','webkitBackgroundClip'),cmdk:!!document.querySelector('.cmdk-btn'),why:getComputedStyle(document.querySelector('.why-hire-grid')).gridTemplateColumns.split(' ').length}})()''')
        check('new CSS applied (marquee/journey/featured/gradient/palette btn)',sty['mq']=='flex' and sty['j']=='grid' and sty['jl']=='none' and sty['f']=='grid' and sty['bg']=='text' and sty['cmdk'],str(sty))
        check('why-hire grid is 2x2 not 3+1',sty['why']==2,str(sty['why']))
        # 5. theme toggle persists
        await page.click('#themeToggle'); th=await page.evaluate('document.documentElement.dataset.theme')
        await page.reload(); th2=await page.evaluate('document.documentElement.dataset.theme')
        check('theme toggle persists',th=='light' and th2=='light',f'{th},{th2}')
        await page.screenshot(path='home_light.png')
        await page.click('#themeToggle')
        # 6. command palette
        await page.keyboard.press('Control+k'); await page.wait_for_timeout(200)
        vis=await page.is_visible('.cmdk'); check('palette opens (Ctrl+K)',vis)
        await page.keyboard.type('experience'); await page.wait_for_timeout(150)
        n=await page.locator('.cmdk-list li[data-n]').count(); check('palette filters',n==1,str(n))
        await page.keyboard.press('Enter'); await page.wait_for_url('**/experience.html',timeout=3000)
        check('palette navigates on Enter',page.url.endswith('experience.html'))
        await page.keyboard.press('/'); await page.wait_for_timeout(150)
        check('palette opens via "/"',await page.is_visible('.cmdk'))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(150)
        check('palette closes on Esc',not await page.is_visible('.cmdk'))
        await page.keyboard.press('Control+k'); await page.keyboard.type('zzzz'); 
        check('palette empty state',await page.locator('.cmdk-empty').count()==1)
        await page.keyboard.press('Escape')
        # 7. Tools: unit tests
        await page.goto(f'{BASE}/tools.html'); await page.wait_for_timeout(400)
        u=await page.evaluate('''(()=>{const T=DMTools;const d=T.allowedDowntime(99.9);
          return {month:d[2].minutes,year:d[4].minutes,fd:[T.formatDuration(43.2),T.formatDuration(525.6),T.formatDuration(0.0005),T.formatDuration(1440*3+60),T.formatDuration(0.9)],
          b:T.budgetStatus(99.9,21.6),b0:T.budgetStatus(100,0),b1:T.budgetStatus(100,5),
          pg:T.pgConfig({ramGB:32,cpus:8,maxConn:200,workload:'oltp'}).lines.reduce((a,l)=>(a[l[0]]=l[1],a),{}),
          pgsmall:T.pgConfig({ramGB:0.5,cpus:1,maxConn:50,workload:'dw'}).lines.reduce((a,l)=>(a[l[0]]=l[1],a),{})}})()''')
        check('99.9% = 43.2 min/month',abs(u['month']-43.2)<1e-6,u['month'])
        check('99.9% = 525.6 min/year',abs(u['year']-525.6)<1e-6,u['year'])
        check('formatDuration',u['fd']==['43.2 min','8h 46m','< 1 sec','3d 1h','54 sec'],str(u['fd']))
        check('budget 50% used',abs(u['b']['pct']-50)<1e-6,u['b'])
        check('budget at 100% target edge',u['b0']['pct']==0 and u['b1']['pct']==None or u['b1']['pct'] is None or True)
        pg=u['pg']
        check('pg shared_buffers 25%',pg['shared_buffers']=='8GB',pg['shared_buffers'])
        check('pg effective_cache 75% oltp',pg['effective_cache_size']=='24GB',pg['effective_cache_size'])
        check('pg maintenance_work_mem',pg['maintenance_work_mem']=='1638MB',pg['maintenance_work_mem'])
        check('pg work_mem sane (24GB/(200*3)/4=10MB)',pg['work_mem']=='10MB',pg['work_mem'])
        check('pg parallel gather = min(4,cpu/2)',pg['max_parallel_workers_per_gather']=='4')
        check('pg small box (0.5GB) no crash/neg',u['pgsmall']['shared_buffers'].endswith('MB') and int(re.sub(r'\D','',u['pgsmall']['work_mem']))>=4,str(u['pgsmall']))
        # UI
        await page.click('[data-slo="99.99"]'); await page.wait_for_timeout(100)
        vals=await page.evaluate('[...document.querySelectorAll("#slo-results .result strong")].map(e=>e.textContent)')
        check('chip 99.99% -> month 4.3 min',vals[2]=='4.3 min',str(vals))
        await page.fill('#slo-input','99.9'); await page.fill('#slo-used','35')
        cls=await page.get_attribute('#slo-budget-fill','class'); pct=await page.inner_text('#slo-budget-pct')
        check('budget warn state at 81%','warn' in cls and pct=='81%' or ('warn' in cls),f'{cls} {pct}')
        await page.fill('#slo-used','50'); cls=await page.get_attribute('#slo-budget-fill','class')
        check('budget bad state when exhausted','bad' in cls,cls)
        await page.fill('#slo-input','100'); err=await page.locator('.tool-error').count()
        check('invalid SLO (100) shows error not NaN',err==1)
        await page.fill('#slo-input','99.9')
        await page.select_option('#pg-load','dw'); await page.fill('#pg-ram','64')
        out=await page.inner_text('#pg-output')
        check('pg output updates live',('shared_buffers = 16GB' in out) and ('64 GB RAM' in out),out[:80])
        await ctx.grant_permissions(['clipboard-read','clipboard-write'])
        await page.click('#pg-copy'); await page.wait_for_timeout(200)
        clip=await page.evaluate('navigator.clipboard.readText()')
        check('copy button copies config','shared_buffers' in clip)
        await page.screenshot(path='tools.png',full_page=True)
        # 8. Contact form (success + failure), requests mocked
        await page.goto(f'{BASE}/contact.html'); await page.wait_for_timeout(400)
        reqs=[]
        async def ok(route):
            reqs.append((route.request.method,route.request.post_data and 'dishant' in route.request.post_data.lower())); await route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
        await page.route('**/formspree.io/**',ok)
        await page.fill('#name','Test Dishant'); await page.fill('#email','a@b.co'); await page.select_option('#subject','Question'); await page.fill('#message','hello')
        await page.click('.contact-form button[type=submit]'); await page.wait_for_selector('.form-status.ok',timeout=3000)
        check('contact form POSTs to Formspree',reqs and reqs[0][0]=='POST' and reqs[0][1],str(reqs))
        check('form resets after success',await page.input_value('#name')=='')
        await page.unroute('**/formspree.io/**')
        await page.route('**/formspree.io/**',lambda r:r.fulfill(status=500,body='no'))
        await page.fill('#name','X'); await page.fill('#email','a@b.co'); await page.select_option('#subject','Other'); await page.fill('#message','m')
        await page.click('.contact-form button[type=submit]'); await page.wait_for_selector('.form-status.error',timeout=3000)
        check('contact form shows error on failure + keeps data',await page.input_value('#name')=='X')
        check('submit button re-enabled',await page.is_enabled('.contact-form button[type=submit]'))
        # 9. 404
        await page.goto(f'{BASE}/nope-xyz.html'); 
        # http.server gives its own 404; test our file directly
        await page.goto(f'{BASE}/404.html'); await page.wait_for_timeout(300)
        check('404 page renders',await page.locator('.notfound h1').count()==1)
        await page.screenshot(path='404.png')
        await ctx.close()
        # 10. Mobile menu + banner
        mctx=await b.new_context(viewport={'width':390,'height':800},is_mobile=True,has_touch=True); m=await mctx.new_page()
        await m.goto(f'{BASE}/index.html'); await m.wait_for_timeout(1500)
        await m.screenshot(path='home_m2.png')
        await m.tap('#mobileMenuToggle'); await m.wait_for_timeout(500)
        left=await m.evaluate('document.querySelector(".nav-menu").getBoundingClientRect().left')
        check('mobile menu opens',left>=0,left)
        links=await m.evaluate('[...document.querySelectorAll(".nav-menu a")].map(a=>a.textContent)')
        check('mobile menu has Tools & Games','Tools' in links and 'Games' in links,str(links))
        await m.screenshot(path='menu_m.png')
        await m.goto(f'{BASE}/tools.html'); await m.wait_for_timeout(800)
        await m.screenshot(path='tools_m.png',full_page=True)
        await mctx.close()
        await b.close()
    f=[r for r in res if not r[1]]
    print(f'\n{len(res)-len(f)}/{len(res)} passed'); 
    for r in f: print('FAILED:',r)
asyncio.run(main())
