"""Responsive regression tests: phones, tablets, desktops. Serve the site on :8000 first."""
import asyncio, glob, os, re
from playwright.async_api import async_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
BASE='http://localhost:8000'
res=[]
def check(name,cond,detail=''):
    res.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail if not cond else '')

WIDTHS=[320,360,375,390,412,480,600,768,820,834,900,1000,1001,1024,1100,1280,1440]
FULL_PAGES=['index.html','tools.html','blog.html','games.html']
OTHER_PAGES=['about.html','experience.html','projects.html','contact.html','resume.html','word-game.html','typing-game.html','snake-game.html','game.html','blog/postgresql-p95-latency-playbook.html']
OTHER_WIDTHS=[320,375,412,768,820,1024,1440]

NAV_JS='''(()=>{const vw=innerWidth,c=document.querySelector(".nav-container");
 const kids=[...c.children].filter(k=>{const cs=getComputedStyle(k);return cs.display!=="none"&&cs.visibility!=="hidden"&&k.getBoundingClientRect().width>0&&cs.position!=="fixed"});
 const rs=kids.map(k=>({n:(k.className||k.tagName).toString().split(" ")[0],r:k.getBoundingClientRect()}));
 const outside=rs.filter(x=>x.r.left<-0.5||x.r.right>vw+0.5).map(x=>x.n+" "+Math.round(x.r.left)+".."+Math.round(x.r.right));
 const ov=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i].r,b=rs[j].r;if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)ov.push(rs[i].n+"<>"+rs[j].n)}
 const links=[...document.querySelectorAll(".nav-menu a")],vis=links.filter(a=>{const cs=getComputedStyle(a);return cs.visibility!=="hidden"&&a.getBoundingClientRect().width>0&&a.getBoundingClientRect().right>0&&a.getBoundingClientRect().left<vw});
 const tops=new Set(vis.map(a=>Math.round(a.getBoundingClientRect().top)));
 const tog=document.getElementById("mobileMenuToggle");
 return {outside,ov,visibleLinks:vis.length,oneRow:tops.size<=1,hamburger:getComputedStyle(tog).display!=="none",sw:document.documentElement.scrollWidth,vw}})()'''

async def main():
    # ---------- static ----------
    pages=sorted(glob.glob(ROOT+'/*.html')+glob.glob(ROOT+'/blog/*.html'))
    dups=[]
    for f in pages:
        h=open(f).read()
        for m in re.finditer(r'(<a [^>]*>(?:(?!</a>).)*</a>)\s*\1',h,re.S): dups.append((os.path.basename(f),m.group(1)[:60]))
    check('static: no duplicated adjacent links/buttons on any page',not dups,dups)
    check('static: homepage has exactly one "All 6 Games" button',open(ROOT+'/index.html').read().count('<span>All 6 Games</span>')==1)
    ids_bad=[]
    for f in pages:
        ids=re.findall(r'\sid="([^"]+)"',open(f).read()); d={i for i in ids if ids.count(i)>1}
        if d: ids_bad.append((os.path.basename(f),d))
    check('static: no duplicate element ids on any page',not ids_bad,ids_bad)
    check('static: viewport meta present on every page',all('name="viewport"' in open(f).read() for f in pages))

    async with async_playwright() as p:
        b=await p.chromium.launch()
        errs=[]
        # ---------- widths sweep (touch for <=1024, desktop above) ----------
        for w in WIDTHS:
            touch = w<=1024
            ctx=await b.new_context(viewport={'width':w,'height':900 if w>600 else 800},is_mobile=touch,has_touch=touch); page=await ctx.new_page()
            page.on('pageerror',lambda e:errs.append(str(e)))
            for pg in FULL_PAGES+(OTHER_PAGES if w in OTHER_WIDTHS else []):
                await page.goto(f'{BASE}/{pg}'); await page.wait_for_timeout(450)
                if pg in FULL_PAGES:
                    # scroll the whole page: late layout shifts / scroll-driven effects must not widen the page
                    H=await page.evaluate('document.documentElement.scrollHeight')
                    for y in range(0,min(H,9000),900): await page.evaluate(f'scrollTo(0,{y})'); await page.wait_for_timeout(40)
                    await page.evaluate('scrollTo(0,0)')
                sw=await page.evaluate('document.documentElement.scrollWidth-innerWidth')
                check(f'{w}px {pg}: no horizontal overflow',sw<=0,sw)
            n=await page.evaluate(NAV_JS) if True else None
            await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(400); n=await page.evaluate(NAV_JS)
            check(f'{w}px nav: nothing pushed outside the screen, no overlaps',not n['outside'] and not n['ov'],n)
            if w<=1000:
                check(f'{w}px nav: hamburger shown, links hidden while closed',n['hamburger'] and n['visibleLinks']==0,n)
            else:
                check(f'{w}px nav: full menu in one row, no hamburger',(not n['hamburger']) and n['visibleLinks']==8 and n['oneRow'],n)
            await ctx.close()

        # ---------- mobile menu behaviour: phone + tablet ----------
        for label,w,h in [('phone 390',390,844),('small phone 320',320,568),('tablet 820',820,1180),('tablet 768',768,1024)]:
            ctx=await b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True); page=await ctx.new_page()
            page.on('pageerror',lambda e:errs.append(str(e)))
            await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(600)
            await page.tap('#mobileMenuToggle'); await page.wait_for_timeout(600)
            m=await page.evaluate('''(()=>{const menu=document.querySelector(".nav-menu"),nb=document.querySelector(".navbar").getBoundingClientRect(),r=menu.getBoundingClientRect(),cs=getComputedStyle(menu);
              const bg=cs.backgroundColor.match(/[\\d.]+/g).map(Number);const links=[...menu.querySelectorAll("a")];
              const mid=document.elementFromPoint(innerWidth/2,innerHeight*0.8);
              return {exp:document.getElementById("mobileMenuToggle").getAttribute("aria-expanded"),tog:document.getElementById("mobileMenuToggle").classList.contains("active"),
                opaque:bg.length<4||bg[3]===1,top:Math.round(r.top),navBottom:Math.round(nb.bottom),bottom:Math.round(r.bottom),vh:innerHeight,left:Math.round(r.left),right:Math.round(r.right),vw:innerWidth,
                lock:getComputedStyle(document.body).overflow,minH:Math.min(...links.map(a=>a.getBoundingClientRect().height)),n:links.length,
                blocked:!!(mid&&mid.closest(".nav-menu")),vis:cs.visibility,anyAbove:links.every(a=>a.getBoundingClientRect().bottom<=innerHeight)}})()''')
            check(f'{label}: menu opens (aria-expanded, X icon)',m['exp']=='true' and m['tog'],m)
            check(f'{label}: menu panel is opaque (page does not show through)',m['opaque'] and m['vis']=='visible',m)
            check(f'{label}: menu fills screen below the navbar',abs(m['top']-m['navBottom'])<=2 and abs(m['bottom']-m['vh'])<=2 and m['left']==0 and m['right']==m['vw'],m)
            check(f'{label}: 8 links, each tap target >= 44px, all on screen',m['n']==8 and m['minH']>=44 and m['anyAbove'],m)
            check(f'{label}: page content behind the menu is not tappable',m['blocked'] and m['lock']=='hidden',m)
            await page.keyboard.press('Escape'); await page.wait_for_timeout(500)
            c=await page.evaluate('({exp:document.getElementById("mobileMenuToggle").getAttribute("aria-expanded"),lock:getComputedStyle(document.body).overflow,vis:getComputedStyle(document.querySelector(".nav-menu")).visibility,focus:document.activeElement.id})')
            check(f'{label}: Escape closes menu, restores scroll, returns focus',c['exp']=='false' and c['lock']!='hidden' and c['vis']=='hidden' and c['focus']=='mobileMenuToggle',c)
            await page.tap('#mobileMenuToggle'); await page.wait_for_timeout(400); await page.tap('#mobileMenuToggle'); await page.wait_for_timeout(500)
            check(f'{label}: second tap on the icon closes the menu',await page.evaluate('getComputedStyle(document.querySelector(".nav-menu")).visibility')=='hidden')
            await page.tap('#mobileMenuToggle'); await page.wait_for_timeout(500); await page.tap('.nav-menu >> text=Projects'); await page.wait_for_url('**/projects.html',timeout=5000); await page.wait_for_timeout(400)
            check(f'{label}: tapping a menu link navigates and the new page loads closed',page.url.endswith('/projects.html') and await page.evaluate('document.getElementById("mobileMenuToggle").getAttribute("aria-expanded")')=='false')
            await ctx.close()
        # growing the window closes an open menu (rotation / resize)
        ctx=await b.new_context(viewport={'width':820,'height':1180},is_mobile=False,has_touch=True); page=await ctx.new_page()
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(400); await page.click('#mobileMenuToggle'); await page.wait_for_timeout(400)
        await page.set_viewport_size({'width':1200,'height':800}); await page.wait_for_timeout(500)
        st=await page.evaluate('({exp:document.getElementById("mobileMenuToggle").getAttribute("aria-expanded"),lock:getComputedStyle(document.body).overflow})')
        check('rotating/resizing past 1000px closes the open menu and unlocks scrolling',st['exp']=='false' and st['lock']!='hidden',st)
        await ctx.close()

        # ---------- light theme menu: opaque + readable ----------
        ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); page=await ctx.new_page()
        await ctx.add_init_script("localStorage.setItem('theme','light')")
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(1000); await page.tap('#mobileMenuToggle'); await page.wait_for_timeout(700)
        L=await page.evaluate('''(()=>{const lum=c=>{const [r,g,b]=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
          const menu=document.querySelector(".nav-menu"),bg=getComputedStyle(menu).backgroundColor,a=menu.querySelector("a:not(.resume-link)"),fg=getComputedStyle(a).color;
          const l1=lum(bg),l2=lum(fg);return {bg,fg,ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),theme:document.documentElement.dataset.theme}})()''')
        check('light theme: menu is solid and links meet 4.5:1 contrast',L['theme']=='light' and L['ratio']>=4.5,L)
        await ctx.close()

        # ---------- touch vs mouse specifics ----------
        for label,w,touch,expect in [('phone',390,True,False),('iPad landscape',1024,True,False),('desktop',1280,False,True)]:
            ctx=await b.new_context(viewport={'width':w,'height':800},is_mobile=touch,has_touch=touch); page=await ctx.new_page()
            await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(500)
            shown=await page.evaluate('getComputedStyle(document.querySelector(".cmdk-btn")).display!=="none"')
            check(f'{label}: "Ctrl K" search button is {"shown" if expect else "hidden"}',shown==expect,shown)
            await ctx.close()

        # ---------- banner + hero on tablets and phones ----------
        for label,w,h in [('iPad Air 820',820,1180),('iPad mini 768',768,1024),('phone 390',390,844),('phone 320',320,568)]:
            ctx=await b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True); page=await ctx.new_page()
            await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(900)
            v=await page.evaluate('''(()=>{const nb=document.querySelector(".navbar").getBoundingClientRect(),b=document.querySelector(".hiring-banner").getBoundingClientRect(),hv=getComputedStyle(document.querySelector(".hero-visual")).display,act=getComputedStyle(document.querySelector(".hiring-actions")).display,t=document.querySelector(".hero-title").getBoundingClientRect(),cs=getComputedStyle(document.querySelector(".hiring-banner")).position;
              return {bannerTop:Math.round(b.top),navBottom:Math.round(nb.bottom),bannerH:Math.round(b.height),hv,act,titleRight:Math.round(t.right),vw:innerWidth,titleLeft:Math.round(t.left),pos:cs}})()''')
            check(f'{label}: banner sits below navbar (no overlap) and is compact',v['bannerTop']>=v['navBottom']-2 and v['bannerH']<=90 and v['act']=='none',v)
            check(f'{label}: floating hero cards hidden (they overlapped on tablets)',v['hv']=='none',v)
            check(f'{label}: hero title fits on screen',v['titleLeft']>=0 and v['titleRight']<=v['vw'],v)
            await ctx.close()
        ctx=await b.new_context(viewport={'width':1280,'height':800}); page=await ctx.new_page(); await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(600)
        d=await page.evaluate('({hv:getComputedStyle(document.querySelector(".hero-visual")).display,act:getComputedStyle(document.querySelector(".hiring-actions")).display,pos:getComputedStyle(document.querySelector(".hiring-banner")).position})')
        check('desktop 1280: floating cards, banner buttons and scroll-away banner still present',d['hv']!='none' and d['act']!='none' and d['pos']=='absolute',d)
        await ctx.close()

        # ---------- tap targets on touch devices ----------
        ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); page=await ctx.new_page()
        small={}
        for pg in ['index.html','blog.html','projects.html','tools.html','games.html','word-game.html','contact.html']:
            await page.goto(f'{BASE}/{pg}'); await page.wait_for_timeout(500)
            s=await page.evaluate('''[...document.querySelectorAll("a.btn,.btn,.chip,.blog-filter-btn,.project-filter-btn,.theme-toggle,#mobileMenuToggle,.footer-links a")].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display!=="none"&&cs.visibility!=="hidden"&&r.width>0&&e.offsetParent!==null&&r.height<43.5}).map(e=>(e.className||e.tagName).toString().split(" ")[0]+" "+Math.round(e.getBoundingClientRect().width)+"x"+Math.round(e.getBoundingClientRect().height))''')
            if s: small[pg]=sorted(set(s))[:5]
        check('phone: buttons, chips, filters and icons are >= 44px tall (touch guideline)',not small,small)
        await page.goto(f'{BASE}/word-game.html'); await page.wait_for_timeout(500)
        kw=await page.evaluate('[...document.querySelectorAll(".wg-key")].map(k=>k.getBoundingClientRect().width)'); check('phone 390: word-game keys at least 28px wide',min(kw)>=28,min(kw))
        await ctx.close()
        ctx=await b.new_context(viewport={'width':360,'height':740},is_mobile=True,has_touch=True); page=await ctx.new_page()
        await page.goto(f'{BASE}/word-game.html'); await page.wait_for_timeout(500)
        kw=await page.evaluate('[...document.querySelectorAll(".wg-key:not(.wide)")].map(k=>k.getBoundingClientRect().width)'); check('phone 360: word-game letter keys at least 26px wide and keyboard fits',min(kw)>=26 and await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),min(kw))
        # stats cards
        for w in (320,360,375):
            await page.set_viewport_size({'width':w,'height':740}); await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(800)
            await page.evaluate('document.querySelector(".quick-stats").scrollIntoView()'); await page.wait_for_timeout(1800)
            s=await page.evaluate('[...document.querySelectorAll(".stat-card")].map(c=>({fits:c.scrollWidth<=c.clientWidth+1,n:c.querySelector(".stat-number").scrollWidth<=c.querySelector(".stat-number").clientWidth+1,text:c.querySelector(".stat-number").textContent}))')
            check(f'{w}px: all 4 stat cards fit their numbers ({[x["text"] for x in s]})',len(s)==4 and all(x['fits'] and x['n'] for x in s),s)
        await ctx.close()
        check('no JS errors anywhere in the responsive run',not errs,errs[:3])
        await b.close()
    f=[r for r in res if not r[1]]
    print(f'\n{len(res)-len(f)}/{len(res)} passed')
    for r in f[:40]: print('FAILED:',r)
asyncio.run(main())
