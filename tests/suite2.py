"""SEO + feature tests. Run with the site served on :8000 (python3 -m http.server 8000)."""
import asyncio, glob, os, re, json, subprocess, xml.etree.ElementTree as ET
from playwright.async_api import async_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
BASE='http://localhost:8000'; SITE='https://dishantmodh.com'
res=[]
def check(name,cond,detail=''):
    res.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail if not cond else '')
def rd(p): return open(os.path.join(ROOT,p)).read()

pages=sorted(os.path.basename(f) for f in glob.glob(ROOT+'/*.html') if not f.endswith('404.html'))
posts=sorted(glob.glob(ROOT+'/blog/*.html'))
allp=[(p,p) for p in pages]+[('blog/'+os.path.basename(p),'blog/'+os.path.basename(p)) for p in posts]

# ---------- static SEO checks ----------
titles={}
for rel,_ in allp:
    h=rd(rel)
    t=re.findall(r'<title>(.*?)</title>',h,re.S); d=re.findall(r'name="description" content="([^"]*)"',h)
    can=re.findall(r'rel="canonical" href="([^"]*)"',h)
    path='/' if rel=='index.html' else '/'+rel
    check(f'{rel}: exactly 1 <title> (<=70 chars)',len(t)==1 and len(t[0])<=70,t)
    titles.setdefault(t[0] if t else '',[]).append(rel)
    check(f'{rel}: meta description 100-170 chars',len(d)==1 and 100<=len(d[0])<=170,f'{len(d[0]) if d else 0}')
    check(f'{rel}: canonical correct',can==[SITE+path],can)
    check(f'{rel}: exactly 1 <h1>',len(re.findall(r'<h1[ >]',h))==1,len(re.findall(r'<h1[ >]',h)))
    check(f'{rel}: <main> landmark + lang + skip link','<main' in h and '<html lang="en"' in h and 'skip-link' in h)
    check(f'{rel}: OG + Twitter tags',all(x in h for x in ['og:title','og:description','og:image','og:url','twitter:card','twitter:image']))
    ok=True; n=0
    for m in re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>',h,re.S):
        try: j=json.loads(m); n+=1; ok&=('@context' in j)
        except Exception as e: ok=False
    check(f'{rel}: valid JSON-LD',ok and n>=1)
    check(f'{rel}: all <img> have alt',not re.findall(r'<img(?![^>]*alt=)[^>]*>',h))
    check(f'{rel}: no stale "Open to"/4+ years',('Open to Opportunities' not in h) and ('4+ years' not in h))
check('page titles are unique',all(len(v)==1 for v in titles.values()),{k:v for k,v in titles.items() if len(v)>1})

# schema specifics
idx=rd('index.html')
check('home Person schema: Disney, sameAs, jobTitle',all(x in idx for x in ['"Senior Database Reliability Engineer"','The Walt Disney Company','linkedin.com/in/dishantmodh','github.com/dhmodh']))
for p in posts:
    h=open(p).read(); j=[json.loads(x) for x in re.findall(r'ld\+json">\s*(.*?)\s*</script>',h,re.S)][0]['@graph']
    art=[x for x in j if x['@type']=='BlogPosting'][0]; bc=[x for x in j if x['@type']=='BreadcrumbList'][0]
    words=len(re.sub(r'<[^>]+>',' ',h.split('post-body')[1]).split())
    n=os.path.basename(p)
    check(f'{n}: BlogPosting + breadcrumb valid',art['headline'] and re.match(r'\d{4}-\d\d-\d\d',art['datePublished']) and len(bc['itemListElement'])==3)
    check(f'{n}: substantial content (>500 words)',words>500,words)
    ids=re.findall(r'<h2 id="([^"]+)"',h); check(f'{n}: unique heading ids',len(ids)==len(set(ids)) and len(ids)>=5,ids)

# sitemap / robots / feed
sm=ET.parse(os.path.join(ROOT,'sitemap.xml')).getroot(); ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
locs=[e.text for e in sm.findall('.//s:loc',ns)]
missing=[l for l in locs if not os.path.exists(os.path.join(ROOT,l.replace(SITE,'').lstrip('/') or 'index.html'))]
check('sitemap: every URL maps to a real file',not missing,missing)
indexable=[SITE+('/' if p=='index.html' else '/'+p) for p,_ in allp]
check('sitemap: every indexable page listed',all(u in locs for u in indexable),[u for u in indexable if u not in locs])
check('sitemap: no duplicates',len(locs)==len(set(locs)))
check('robots.txt points to sitemap','Sitemap: https://dishantmodh.com/sitemap.xml' in rd('robots.txt'))
feed=ET.parse(os.path.join(ROOT,'feed.xml')).getroot(); items=feed.findall('.//item')
check('feed.xml valid, one item per post',len(items)==len(posts),len(items))
check('llms.txt exists and mentions Disney','Disney' in rd('llms.txt'))
check('og-image is 1200x630 jpeg',subprocess.run(['python3','-c','from PIL import Image;im=Image.open("%s/og-image.jpg");print(im.size)'%ROOT],capture_output=True,text=True).stdout.strip()=='(1200, 630)')
# links incl. blog subdir
broken=[]
for rel,_ in allp+[('404.html','')]:
    base=os.path.dirname(rel)
    for h in re.findall(r'(?:href|src)="([^"#?]+)',rd(rel)):
        if h.startswith(('http','mailto','tel','//')): continue
        t=h.lstrip('/') if h.startswith('/') else os.path.normpath(os.path.join(base,h))
        if t and not os.path.exists(os.path.join(ROOT,t)): broken.append((rel,h))
check('all internal links/assets resolve (incl. /blog/)',not broken,broken)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1366,'height':800}); page=await ctx.new_page()
        errs=[]; page.on('pageerror',lambda e:errs.append(str(e)))
        # ----- all new pages load clean at 3 sizes
        for vp,vn in [({'width':1366,'height':800},'desktop'),({'width':390,'height':800},'mobile')]:
            c2=await b.new_context(viewport=vp)
            for rel,_ in allp:
                pg=await c2.new_page(); e=[]; bad=[]
                pg.on('pageerror',lambda x:e.append(str(x)))
                pg.on('response',lambda r: bad.append(r.url) if r.status>=400 and 'localhost' in r.url and 'favicon.ico' not in r.url else None)
                await pg.goto(f'{BASE}/{rel}'); await pg.wait_for_timeout(300)
                ov=await pg.evaluate('document.documentElement.scrollWidth-innerWidth')
                check(f'{vn} {rel} clean, no h-scroll',not e and not bad and ov<=1,f'{e} {bad} {ov}')
                await pg.close()
            await c2.close()
        # ----- failover simulator: pure model
        await page.goto(f'{BASE}/tools.html'); await page.wait_for_timeout(400)
        r=await page.evaluate('''(()=>{const C=DMSim.Cluster;let c=new C({detect:3});c.tick(1);const pre=c.availability();c.killLeader();c.tick(10);
          const a={leader:c.leader,last:c.lastFailover,failed:c.writesFailed,avail:c.availability(),pre};
          let d=new C({detect:1});d.killLeader();d.tick(10);const b1={last:d.lastFailover,leader:d.leader};
          let q=new C({detect:3});q.kill('node-2');q.kill('node-3');q.tick(2);q.killLeader();q.tick(20);const qq={leader:q.leader,quorum:q.hasQuorum(),failedGrowing:q.writesFailed};
          q.revive('node-2');q.tick(10);qq.oneRevive=q.leader;q.revive('node-3');q.tick(10);qq.afterRevive=q.leader;
          let m=new C({detect:3});m.killLeader();m.tick(3.2);const cand=m.candidate;m.kill(cand);m.revive('node-1');m.tick(15);const mid={leader:m.leader,cand,failovers:m.failovers};
          let rr=new C();rr.kill('node-1');rr.revive('node-1');
          return {a,b1,qq,mid,replicaRevive:rr.node('node-1').role}})()''')
        check('sim: failover time = detect(3)+promote(1)=4.0s',abs(r['a']['last']-4.0)<0.15,r['a'])
        check('sim: promotes lowest-lag replica (node-2)',r['a']['leader']=='node-2',r['a']['leader'])
        check('sim: ~400 writes failed during 4s outage',abs(r['a']['failed']-400)<25,r['a']['failed'])
        check('sim: availability <100% after outage, 100% before',r['a']['avail']<100 and r['a']['pre']==100)
        check('sim: detect=1 -> 2.0s failover',abs(r['b1']['last']-2.0)<0.15,r['b1'])
        check('sim: quorum lost (1/3) -> no leader elected',r['qq']['leader'] is None and r['qq']['quorum'] is False,r['qq'])
        check('sim: 1 node back is still no quorum; 2 nodes back elects a leader',r['qq']['oneRevive'] is None and r['qq']['afterRevive'] is not None,r['qq'])
        check('sim: candidate dying mid-promotion re-elects',r['mid']['leader'] is not None and r['mid']['leader']!=r['mid']['cand'],r['mid'])
        check('sim: revived node rejoins as replica',r['replicaRevive']=='replica')
        # ----- failover UI
        await page.goto(f'{BASE}/tools.html#failover'); await page.wait_for_timeout(500)
        await page.click('#fo-kill-leader'); await page.wait_for_timeout(300)
        st=await page.inner_text('#fo-status'); check('sim UI: shows FAILING after leader kill','FAILING' in st,st)
        await page.evaluate('__sim.tick(6)'); await page.wait_for_timeout(300)
        st=await page.inner_text('#fo-status'); roles=await page.evaluate('[...document.querySelectorAll("[data-node]")].map(n=>n.className)')
        check('sim UI: recovers, node-2 leader, node-1 down','accepting' in st and 'leader' in roles[1] and 'down' in roles[0],f'{st} {roles}')
        check('sim UI: log has entries + last failover shown',await page.locator('#fo-log li').count()>=4 and (await page.inner_text('#fo-last')).endswith('s'))
        await page.click('[data-node="node-3"]'); await page.click('[data-node="node-2"]'); await page.wait_for_timeout(200)
        check('sim UI: killing 2 nodes shows QUORUM LOST','QUORUM LOST' in await page.inner_text('#fo-quorum'))
        await page.click('#fo-reset'); await page.wait_for_timeout(200)
        check('sim UI: reset restores healthy cluster','accepting' in await page.inner_text('#fo-status') and await page.locator('#fo-log li').count()==1)
        await page.fill('#fo-detect','8') if False else await page.evaluate('(()=>{const e=document.getElementById("fo-detect");e.value=8;e.dispatchEvent(new Event("input"))})()')
        check('sim UI: detect slider updates label and model',(await page.inner_text('#fo-detect-val'))=='8s' and await page.evaluate('__sim.detect')==8)
        # ----- terminal unit
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(500)
        t=await page.evaluate('''(()=>{const r=DMTerm.run;return {help:r('help').lines.join('\\n'),who:r('whoami').lines.join(' '),unk:r('foo').lines[0],open:r('open tools'),open2:r('open Tools.html'),bad:r('open xyz').lines[0],clear:r('clear'),empty:r('  ').lines.length,sudo:r('sudo rm -rf /').lines[0],theme:r('theme').action}})()''')
        check('terminal: help lists commands','whoami' in t['help'] and 'contact' in t['help'])
        check('terminal: whoami mentions Disney','Disney' in t['who'])
        check('terminal: unknown command message','command not found: foo' in t['unk'])
        check('terminal: open tools navigates',t['open']['nav']=='/tools.html' and t['open2']['nav']=='/tools.html',t['open'])
        check('terminal: open <bad> errors, no nav','unknown page' in t['bad'])
        check('terminal: clear/empty/sudo/theme',t['clear']['clear'] and t['empty']==0 and 'sudoers' in t['sudo'] and t['theme']=='theme')
        # terminal UI
        await page.evaluate('document.getElementById("terminal").scrollIntoView()'); await page.wait_for_timeout(600)
        await page.fill('#termInput','whoami'); await page.keyboard.press('Enter')
        o=await page.inner_text('.term-out'); check('terminal UI: runs command and prints',('dishant@modh:~$ whoami' in o) and 'Senior Database Reliability Engineer' in o,o[-200:])
        await page.keyboard.press('ArrowUp'); check('terminal UI: ArrowUp recalls history',await page.input_value('#termInput')=='whoami')
        await page.click('[data-cmd="skills"]'); check('terminal UI: chip runs command','PostgreSQL' in await page.inner_text('.term-out'))
        await page.fill('#termInput','clear'); await page.keyboard.press('Enter'); check('terminal UI: clear empties output',(await page.inner_text('.term-out')).strip()=='')
        await page.fill('#termInput','open blog'); await page.keyboard.press('Enter'); await page.wait_for_url('**/blog.html',timeout=4000); check('terminal UI: "open blog" navigates',page.url.endswith('/blog.html'))
        # ----- blog search/filter + links
        await page.wait_for_timeout(300)
        vis=lambda: page.evaluate('[...document.querySelectorAll(".blog-card")].filter(c=>c.style.display!=="none").length')
        check('blog: one card per article initially',await vis()==len(posts),(await vis(),len(posts)))
        await page.fill('#blogSearch','pgbouncer'); await page.wait_for_timeout(100); check('blog search "pgbouncer" -> 1 card',await vis()==1)
        check('blog search shows count text','1 article found' in await page.inner_text('#blogCount'))
        await page.fill('#blogSearch','zzzzqq'); check('blog search no results message',await vis()==0 and 'No articles match' in await page.inner_text('#blogCount'))
        await page.fill('#blogSearch',''); await page.click('[data-blog-filter="postgresql"]'); n1=await vis()
        await page.fill('#blogSearch','pgbouncer'); n2=await vis()
        check('blog: filter + search combine',n1>=2 and n2==1 and n2<n1,f'{n1},{n2}')
        await page.fill('#blogSearch',''); await page.click('[data-blog-filter="all"]')
        links=await page.evaluate('[...document.querySelectorAll(".blog-card a.blog-link")].map(a=>a.getAttribute("href"))')
        check('blog: every card links to a real article',len(links)==len(posts) and all(os.path.exists(ROOT+l) for l in links),links)
        check('blog: no Coming-soon placeholders left',await page.locator('.blog-soon').count()==0)
        # ----- article page
        await page.click('.blog-card a.blog-link >> nth=0'); await page.wait_for_url('**/blog/**',timeout=4000); await page.wait_for_timeout(500)
        check('article: loads with h1 and no JS errors',await page.locator('h1').count()==1 and not errs,errs)
        n_h2=await page.locator('.post-body h2[id]').count(); n_toc=await page.locator('#toc li').count()
        check('article: TOC built from headings',n_toc==n_h2 and n_h2>=5,f'{n_toc}/{n_h2}')
        check('article: copy button on every code block',await page.locator('.post-body pre .code-copy').count()==await page.locator('.post-body pre').count()>0)
        await ctx.grant_permissions(['clipboard-read','clipboard-write'])
        await page.click('.post-body pre .code-copy >> nth=0'); await page.wait_for_timeout(200)
        check('article: code copy works','pg_stat_statements' in await page.evaluate('navigator.clipboard.readText()'))
        await page.click('#toc a >> nth=2'); await page.wait_for_timeout(500)
        check('article: TOC link jumps to section (hash)', '#' in page.url)
        navok=await page.evaluate('[...document.querySelectorAll(".nav-menu a")].every(a=>a.getAttribute("href").startsWith("/"))')
        check('article: nav links are root-absolute',navok)
        await page.click('.nav-menu >> text=Experience'); await page.wait_for_url('**/experience.html',timeout=4000); check('article: nav -> Experience works',True)
        await page.goto(f'{BASE}/blog/aurora-global-database-dr-readiness.html'); await page.wait_for_timeout(400)
        await page.keyboard.press('Control+k'); await page.keyboard.type('about'); await page.keyboard.press('Enter'); await page.wait_for_url('**/about.html',timeout=4000)
        check('palette from /blog/ page navigates to /about.html (absolute paths)',page.url.endswith('/about.html'))
        # ----- resume page
        await page.goto(f'{BASE}/resume.html'); await page.wait_for_timeout(500)
        txt=await page.inner_text('#resume')
        check('resume page: Disney current, GlobalLogic ends Jul 2026','Walt Disney Company' in txt and 'Jul 2026' in txt and 'Feb 2024 – Jul 2026' in txt)
        check('resume page: education + certs present','Dharmsinh Desai' in txt and 'AWS Solutions Architect' in txt)
        nav_resume=await page.evaluate('document.querySelector(".resume-link").getAttribute("href")'); check('nav Resume -> resume.html',nav_resume=='resume.html',nav_resume)
        await page.emulate_media(media='print'); await page.wait_for_timeout(600)
        hid=await page.evaluate('[".navbar",".no-print",".animated-bg"].map(s=>getComputedStyle(document.querySelector(s)).display)')
        bg=await page.evaluate('getComputedStyle(document.body).backgroundColor')
        check('resume print CSS hides nav/buttons, white bg',hid==['none']*3 and bg=='rgb(255, 255, 255)',f'{hid} {bg}')
        pdf=subprocess.run(['pdftotext','-layout',ROOT+'/resume.pdf','-'],capture_output=True,text=True).stdout
        pages_n=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo',ROOT+'/resume.pdf'],capture_output=True,text=True).stdout).group(1))
        check('resume.pdf includes Disney + current dates + education','Walt Disney' in pdf and 'Jul 2026' in pdf and 'Jul 2026' in pdf and 'Hitachi Digital' in pdf and 'Dharmsinh' in pdf)
        check('resume.pdf is <=3 pages',pages_n<=3,pages_n)
        # ----- home additions
        await page.emulate_media(media='screen'); await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(500)
        check('home: Latest Articles section links to 3 posts',await page.locator('.latest-articles a[href^="blog/"]').count()==3)
        await b.close()
    f=[r for r in res if not r[1]]
    print(f'\n{len(res)-len(f)}/{len(res)} passed')
    for r in f: print('FAILED:',r)
asyncio.run(main())
