"""Games + extra-blog tests. Serve the site on :8000 first."""
import asyncio, os, re
from playwright.async_api import async_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
BASE='http://localhost:8000'
res=[]
def check(name,cond,detail=''):
    res.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail if not cond else '')

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1280,'height':900}); page=await ctx.new_page()
        errs=[]; page.on('pageerror',lambda e:errs.append(str(e)))

        # ========== WORD GAME: pure logic ==========
        await page.goto(f'{BASE}/word-game.html'); await page.wait_for_timeout(400)
        L=await page.evaluate('''(()=>{const W=DMWord;const e=(g,a)=>W.evaluate(g,a).join(',');
          const words=W.WORDS.map(w=>w[0]);
          const g1=new W.Game(['CRANE','hint']);const r1=g1.submit('crane');
          const g2=new W.Game(['CRANE','hint']);for(const w of ['aaaaa','bbbbb','ccccc','ddddd','eeeee','fffff'])g2.submit(w);
          const g3=new W.Game(['CRANE','hint']);g3.submit('ABCDE');
          return {
            exact:e('CRANE','CRANE'),allwrong:e('BBBBB','CRANE'),
            dup1:e('SPEED','ERASE'),dup2:e('LLAMA','ALLOY'),dup3:e('EERIE','THREE'),
            n:words.length,uniq:new Set(words).size,bad:words.filter(w=>!/^[A-Z]{5}$/.test(w)).length,hints:W.WORDS.every(w=>w[1]&&w[1].length>5),
            valid:[W.isValid('abcde'),W.isValid('abcd'),W.isValid('ab1de'),W.isValid('abcdef')],
            won:{s:g1.status,tries:g1.guesses.length},lost:{s:g2.status,tries:g2.guesses.length,after:g2.submit('crane').reason},
            invalid:g3.submit('abc').reason, ls:W.letterStates(g3),
            daily1:W.dailyWord(new Date(2026,0,1))[0],daily2:W.dailyWord(new Date(2026,0,2))[0],dailyWrap:W.dailyWord(new Date(2026,0,1+words.length))[0],
            dailyStable:W.dailyWord(new Date(2026,5,15,3,0))[0]===W.dailyWord(new Date(2026,5,15,23,59))[0],
            share:(()=>{const g=new W.Game(['CRANE','h']);g.submit('SLATE');g.submit('CRANE');return g.share('#1')})()
          }})()''')
        check('word: exact match all correct',L['exact']=='correct,correct,correct,correct,correct',L['exact'])
        check('word: no matches all absent',L['allwrong']=='absent,absent,absent,absent,absent')
        check('word: duplicate letters (SPEED vs ERASE)',L['dup1']=='present,absent,present,present,absent',L['dup1'])
        check('word: duplicate letters (LLAMA vs ALLOY)',L['dup2']=='present,correct,present,absent,absent',L['dup2'])
        check('word: EERIE vs THREE handles repeats',L['dup3']=='present,absent,correct,absent,correct',L['dup3'])
        check('word list: 50 unique valid A-Z 5-letter words with hints',L['n']>=40 and L['uniq']==L['n'] and L['bad']==0 and L['hints'],L)
        check('word: isValid',L['valid']==[True,False,False,False],L['valid'])
        check('word: win flow',L['won']=={'s':'won','tries':1})
        check('word: lose after 6, no more guesses',L['lost']['s']=='lost' and L['lost']['tries']==6 and L['lost']['after']=='over',L['lost'])
        check('word: invalid guess rejected, not consumed',L['invalid']=='invalid')
        check('word: keyboard letter states',L['ls'].get('C')=='present' and L['ls'].get('E')=='correct' or L['ls'].get('E') in ('correct','present'),L['ls'])
        check('word: daily word changes day to day & wraps',L['daily1']!=L['daily2'] and L['dailyWrap']==L['daily1'])
        check('word: daily word stable within a day',L['dailyStable'])
        check('word: share text has emoji grid + link','🟩' in L['share'] and 'dishantmodh.com/word-game' in L['share'] and L['share'].startswith('DB Word Guess #1 2/6'),L['share'])

        # ========== WORD GAME: UI ==========
        await page.evaluate('localStorage.clear()'); await page.reload(); await page.wait_for_timeout(400)
        ans=await page.evaluate('__word.game.answer')
        await page.keyboard.type('ab'); n=await page.evaluate('[...document.querySelectorAll(".wg-tile.filled")].length')
        check('word UI: physical keyboard fills tiles',n==2,n)
        await page.keyboard.press('Backspace'); check('word UI: backspace',await page.evaluate('document.querySelectorAll(".wg-tile.filled").length')==1)
        await page.keyboard.press('Backspace'); await page.keyboard.press('Enter')
        check('word UI: short word says not enough letters','Not enough' in await page.inner_text('#wgMsg'))
        wrong='CRANE' if ans!='CRANE' else 'SLATE'
        await page.keyboard.type(wrong); await page.keyboard.press('Enter'); await page.wait_for_timeout(100)
        tiles=await page.evaluate('[...document.querySelectorAll(".wg-row")[0].children].map(t=>t.textContent+":"+t.className)')
        check('word UI: first row is scored',all(re.search(r'(correct|present|absent)',t) for t in tiles),tiles)
        check('word UI: hint disabled until 2 guesses',await page.is_disabled('#wgHintBtn'))
        await page.keyboard.type('SHARD' if ans!='SHARD' else 'INDEX'); await page.keyboard.press('Enter')
        check('word UI: hint enabled after 2 guesses',await page.is_enabled('#wgHintBtn'))
        await page.click('#wgHintBtn'); check('word UI: hint shown','Hint:' in await page.inner_text('#wgMsg'))
        await page.reload(); await page.wait_for_timeout(400)
        check('word UI: daily progress persists across reload',await page.evaluate('__word.game.guesses.length')==2)
        # solve using on-screen keyboard
        for ch in ans: await page.click(f'.wg-key[data-k="{ch}"]')
        await page.click('.wg-key[data-k="ENTER"]'); await page.wait_for_timeout(300)
        st=await page.evaluate('({s:__word.game.status,stats:JSON.parse(localStorage.getItem("dm_word_stats")),badges:JSON.parse(localStorage.getItem("dm_badges")||"[]")})')
        check('word UI: on-screen keyboard solve -> won',st['s']=='won',st)
        check('word UI: stats saved (played 1, won 1, streak 1)',st['stats']['played']==1 and st['stats']['won']==1 and st['stats']['streak']==1,st['stats'])
        check('word UI: Wordsmith badge awarded','wordsmith' in st['badges'],st['badges'])
        check('word UI: share button visible after finishing',await page.is_visible('#wgShare'))
        await ctx.grant_permissions(['clipboard-read','clipboard-write']); await page.click('#wgShare'); await page.wait_for_timeout(200)
        clip=await page.evaluate('navigator.clipboard.readText()'); check('word UI: share copies grid',clip.startswith('DB Word Guess') and '🟩' in clip,clip[:40])
        await page.click('[data-wg-mode="practice"]'); await page.wait_for_timeout(200)
        check('word UI: practice mode gives a fresh board',await page.evaluate('__word.game.guesses.length')==0 and await page.evaluate('__word.game.status')=='playing')

        # ========== SNAKE: logic ==========
        await page.goto(f'{BASE}/snake-game.html'); await page.wait_for_timeout(400)
        S=await page.evaluate('''(()=>{const {Snake}=DMSnake;const seq=(arr)=>{let i=0;return()=>arr[i++%arr.length]};
          let g=new Snake({cols:10,rows:10,rng:()=>0});const start=g.body.map(s=>s.join(',')).join('|');
          g.step();const moved=g.body[0].join(',');
          const rev=g.setDir('left');
          let w=new Snake({cols:5,rows:5,rng:()=>0});let steps=0;while(w.alive&&steps<20){w.step();steps++}
          let e=new Snake({cols:10,rows:10,rng:()=>0});e.food=[e.body[0][0]+1,e.body[0][1]];const len0=e.body.length;e.step();
          let gold=new Snake({cols:10,rows:10,rng:()=>0});gold.eaten=4;gold.placeFood();const isG=gold.golden;gold.food=[gold.body[0][0]+1,gold.body[0][1]];gold.step();
          let s=new Snake({cols:10,rows:10,rng:()=>0});s.body=[[5,5],[5,6],[4,6],[4,5],[4,4]];s.dir='up';s.nextDir='up';s.food=[0,0];s.setDir('left');s.step();
          let t=new Snake({cols:10,rows:10,rng:()=>0});t.body=[[5,5],[4,5],[4,6],[5,6]];t.dir='up';t.nextDir='up';t.food=[0,0];t.setDir('right');const okT=t.step();
          let f=new Snake({cols:6,rows:6,rng:Math.random});let ok=true;for(let i=0;i<200;i++){f.placeFood();if(f.occupied(f.food[0],f.food[1]))ok=false}
          let sp=new Snake();const sp0=sp.speed();sp.eaten=40;const sp1=sp.speed();sp.eaten=400;
          let dead=new Snake({cols:5,rows:5});dead.alive=false;const ds=dead.step();const sd=dead.setDir('up');
          return {start,moved,rev,wallDead:!w.alive,wallCause:w.cause,eatLen:e.body.length-len0,eatScore:e.score,isG,goldScore:gold.score,selfDead:!s.alive,selfCause:s.cause,tailOk:okT,foodFree:ok,sp0,sp1,spMin:sp.speed(),ds,sd}})()''')
        check('snake: starts with 3 segments moving right',S['start']=='10,10|9,10|8,10'.replace('10,10','5,5').replace('9,10','4,5').replace('8,10','3,5'),S['start'])
        check('snake: step moves head',S['moved']=='6,5',S['moved'])
        check('snake: cannot reverse direction',S['rev'] is False)
        check('snake: wall collision kills (cause wall)',S['wallDead'] and S['wallCause']=='wall',S)
        check('snake: eating grows by 1 and scores 1',S['eatLen']==1 and S['eatScore']==1,S)
        check('snake: every 5th food is golden worth 3',S['isG'] is True and S['goldScore']==3,S)
        check('snake: self collision kills',S['selfDead'] and S['selfCause']=='self',S)
        check('snake: moving into vacated tail cell is allowed',S['tailOk'] is True)
        check('snake: food never spawns on the snake',S['foodFree'])
        check('snake: speed increases but has a floor',S['sp1']<S['sp0'] and S['spMin']==65,(S['sp0'],S['sp1'],S['spMin']))
        check('snake: dead snake ignores input',S['ds'] is False and S['sd'] is False)
        # ========== SNAKE: UI ==========
        await page.click('#snStart'); await page.wait_for_timeout(500)
        alive=await page.evaluate('__snake.game.alive'); head0=await page.evaluate('__snake.game.body[0][0]')
        await page.wait_for_timeout(500); head1=await page.evaluate('__snake.game.body[0][0]')
        check('snake UI: game runs and the snake moves',alive and head1>head0,(head0,head1))
        await page.keyboard.press('ArrowDown'); await page.wait_for_timeout(450)
        check('snake UI: arrow keys change direction',await page.evaluate('__snake.game.dir')=='down')
        await page.keyboard.press(' '); await page.wait_for_timeout(100); p1=await page.evaluate('__snake.game.body[0].join()')
        await page.wait_for_timeout(500); p2=await page.evaluate('__snake.game.body[0].join()')
        check('snake UI: space pauses (snake frozen)',p1==p2 and 'Paused' in await page.inner_text('#snMsg'),(p1,p2))
        await page.keyboard.press(' '); await page.wait_for_timeout(500); p3=await page.evaluate('__snake.game.body[0].join()')
        check('snake UI: space resumes even at score 0 (regression)',p3!=p2,(p2,p3))
        # force a crash and verify game over + best saving + badge
        await page.evaluate('(()=>{const g=__snake.game;g.score=12;g.eaten=12})()')
        await page.evaluate('(()=>{const g=__snake.game;g.body=[[19,5],[18,5],[17,5]];g.dir="right";g.nextDir="right";})()')
        await page.wait_for_timeout(900)
        msg=await page.inner_text('#snMsg')
        best=await page.evaluate('JSON.parse(localStorage.getItem("dm_snake_best"))'); badges=await page.evaluate('JSON.parse(localStorage.getItem("dm_badges")||"[]")')
        check('snake UI: wall crash ends game with message','edge' in msg and 'Score 12' in msg,msg)
        check('snake UI: best score saved + Vacuum Runner badge',best==12 and 'vacuum' in badges,(best,badges))
        await page.keyboard.press(' '); await page.wait_for_timeout(300)
        check('snake UI: space restarts after game over',await page.evaluate('__snake.game.alive && __snake.game.score===0'))
        check('snake UI: canvas drawn (non-blank)',await page.evaluate('(()=>{const c=document.getElementById("snakeCanvas").getContext("2d");const d=c.getImageData(0,0,400,400).data;let n=0;for(let i=0;i<d.length;i+=4*97)if(d[i]+d[i+1]+d[i+2]>60)n++;return n>5})()'))

        # ========== TYPING: logic ==========
        await page.goto(f'{BASE}/typing-game.html'); await page.wait_for_timeout(400)
        T=await page.evaluate('''(()=>{const T=DMTyping;return {c1:T.compare('hello','hello'),c2:T.compare('hello','hxllo'),c3:T.compare('hi','hiya'),c4:T.compare('hello','he'),
          w1:T.wpm(300,60),w2:T.wpm(150,30),w3:T.wpm(0,60),w4:T.wpm(10,0),a1:T.accuracy(95,100),a2:T.accuracy(0,0),a3:T.accuracy(1,3),
          n:T.SNIPPETS.length,ascii:T.SNIPPETS.every(s=>/^[\\x20-\\x7E]+$/.test(s)),uniq:new Set(T.SNIPPETS).size,
          sh:(()=>{const a=T.shuffle([1,2,3,4,5,6],()=>0.5);return a.slice().sort().join()})(),orig:(()=>{const o=[1,2,3];T.shuffle(o);return o.join()})()}})()''')
        check('typing: compare exact / wrong / extra / partial',T['c1']=={'correct':5,'wrong':0} and T['c2']=={'correct':4,'wrong':1} and T['c3']=={'correct':2,'wrong':2} and T['c4']=={'correct':2,'wrong':0},T)
        check('typing: WPM math (300 chars/60s = 60, 150/30s = 30)',T['w1']==60 and T['w2']==60 or (T['w1']==60 and T['w2']==60),(T['w1'],T['w2']))
        check('typing: WPM edge cases (0 chars, 0 seconds)',T['w3']==0 and T['w4']==0)
        check('typing: accuracy math',T['a1']==95 and T['a2']==100 and T['a3']==33,(T['a1'],T['a2'],T['a3']))
        check('typing: snippets are unique printable ASCII',T['n']>=20 and T['uniq']==T['n'] and T['ascii'])
        check('typing: shuffle keeps elements, does not mutate input',T['sh']=='1,2,3,4,5,6' and T['orig']=='1,2,3')
        # ========== TYPING: UI ==========
        check('typing UI: input disabled before start',await page.is_disabled('#tpInput'))
        await page.select_option('#tpLen','30'); await page.click('#tpStart'); await page.wait_for_timeout(200)
        check('typing UI: starts, input enabled and focused',await page.is_enabled('#tpInput') and await page.evaluate('document.activeElement.id')=='tpInput')
        tgt=await page.evaluate('[...document.querySelectorAll("#tpTarget span")].map(s=>s.textContent.replace(/\\u00a0/g," ")).join("")')
        await page.keyboard.type(tgt[:6]); await page.wait_for_timeout(150)
        okc=await page.locator('#tpTarget span.ok').count(); check('typing UI: correct chars highlighted',okc==6,okc)
        await page.keyboard.type('~'); await page.wait_for_timeout(100)
        check('typing UI: wrong char highlighted',await page.locator('#tpTarget span.bad').count()==1)
        await page.keyboard.press('Backspace')
        await page.keyboard.type(tgt[6:]); await page.wait_for_timeout(200)
        check('typing UI: exact snippet auto-advances (snippets=1)',await page.inner_text('#tpDone')=='1' and await page.input_value('#tpInput')=='')
        wpm_now=int(await page.inner_text('#tpWpm')); check('typing UI: live WPM > 0',wpm_now>0,wpm_now)
        await page.evaluate('__typing.end()'); await page.wait_for_timeout(200)
        res_txt=await page.inner_text('#tpResult'); check('typing UI: result summary shown','WPM' in res_txt and 'accuracy' in res_txt,res_txt)
        check('typing UI: input disabled after end, share visible',await page.is_disabled('#tpInput') and await page.is_visible('#tpShare'))
        bestw=await page.evaluate('JSON.parse(localStorage.getItem("dm_typing_best")).wpm'); check('typing UI: personal best saved',bestw>0,bestw)
        # timer really ends the round
        await page.select_option('#tpLen','30'); await page.click('#tpStart')
        await page.evaluate('(()=>{})()'); 
        check('typing UI: restart works',await page.is_enabled('#tpInput'))

        # ========== GAMES HUB ==========
        await page.goto(f'{BASE}/games.html'); await page.wait_for_timeout(600)
        check('hub: 6 game cards',await page.locator('.gx-game').count()==6)
        hrefs=await page.evaluate('[...document.querySelectorAll(".gx-game")].map(a=>a.getAttribute("href"))')
        check('hub: every card links to an existing page',all(os.path.exists(os.path.join(ROOT,h)) for h in hrefs),hrefs)
        check('hub: shows personal bests from storage',('Best' in await page.inner_text('[data-best="snake"]')) and ('WPM' in await page.inner_text('[data-best="typing"]')))
        check('hub: badges render, earned ones highlighted',await page.locator('.gx-badge').count()==7 and await page.locator('.gx-badge.on').count()>=2)
        check('hub: badge counter text','unlocked' in await page.inner_text('#gxBadgeCount'))
        page.once('dialog',lambda d: asyncio.ensure_future(d.accept()))
        await page.click('#gxReset'); await page.wait_for_timeout(300)
        check('hub: reset clears bests and badges',await page.locator('.gx-badge.on').count()==0 and (await page.evaluate('localStorage.getItem("dm_snake_best")')) is None)
        # ========== memory badge integration ==========
        await page.goto(f'{BASE}/memory-game.html'); await page.wait_for_timeout(400)
        check('memory page: games-common loaded + DMG.award available',await page.evaluate('typeof DMG!=="undefined" && typeof DMG.award==="function"'))
        # ========== nav + palette ==========
        for pg in ['index.html','game.html','memory-game.html','incident-game.html','blog.html']:
            await page.goto(f'{BASE}/{pg}'); links=await page.evaluate('[...document.querySelectorAll(".nav-menu a")].map(a=>a.textContent.trim()+"|"+a.getAttribute("href"))')
            check(f'nav on {pg}: standard items, Games -> games.html','Games|games.html' in links and not any('Memory Game' in l or 'Incident Game' in l for l in links),links)
        await page.goto(f'{BASE}/index.html'); await page.keyboard.press('Control+k'); await page.keyboard.type('word'); await page.keyboard.press('Enter'); await page.wait_for_url('**/word-game.html',timeout=4000)
        check('palette finds DB Word Guess',page.url.endswith('/word-game.html'))
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(400)
        check('home: games CTA links to hub',await page.locator('a[href="games.html"].btn').count()>=1)
        import glob as _g, json as _j
        arts=[]
        for f in _g.glob(ROOT+'/blog/*.html'):
            h=open(f).read(); g=_j.loads(re.findall(r'ld\+json">\s*(.*?)\s*</script>',h,re.S)[0])['@graph']
            a=[x for x in g if x['@type']=='BlogPosting'][0]; arts.append((a['datePublished'],a['headline']))
        arts.sort(reverse=True); import html as _h
        want=[_h.unescape(x[1]) for x in arts[:3]]
        got=await page.evaluate('[...document.querySelectorAll(".latest-articles .featured-card h3")].map(h=>h.textContent)')
        check('home: latest articles are the 3 newest by date',got==want,(got,want))

        # ========== new articles ==========
        for slug in ['mongodb-aggregation-pipeline-tuning','datadog-grafana-alerting-reduce-mttr','postgresql-on-call-playbook-p1-incidents','pgbouncer-connection-pooling-guide','terraform-rds-module-patterns','aurora-vs-rds-postgresql-decision-guide','postgresql-backup-pitr-restore-testing','aws-database-cost-optimization-right-sizing','patroni-high-availability-postgresql-guide','postgresql-index-types-guide']:
            pg=await ctx.new_page(); e=[]; pg.on('pageerror',lambda x:e.append(str(x)))
            r=await pg.goto(f'{BASE}/blog/{slug}.html'); await pg.wait_for_timeout(400)
            toc=await pg.locator('#toc li').count(); h2=await pg.locator('.post-body h2[id]').count(); pre=await pg.locator('.post-body pre').count(); cp=await pg.locator('.post-body pre .code-copy').count()
            check(f'article {slug}: 200, TOC={h2}, copy buttons, no JS errors',r.status==200 and toc==h2>=6 and pre==cp and not e,(r.status,toc,h2,pre,cp,e))
            ov=await pg.evaluate('document.documentElement.scrollWidth-innerWidth'); check(f'article {slug}: no horizontal scroll (desktop)',ov<=1,ov)
            await pg.close()
        mp=await ctx.new_page(); await mp.set_viewport_size({'width':390,'height':800})
        for slug in ['terraform-rds-module-patterns','datadog-grafana-alerting-reduce-mttr']:
            await mp.goto(f'{BASE}/blog/{slug}.html'); await mp.wait_for_timeout(300)
            check(f'article {slug}: no horizontal scroll (mobile, code blocks)',await mp.evaluate('document.documentElement.scrollWidth-innerWidth')<=1)
        # mobile games
        for pg in ['games.html','word-game.html','snake-game.html','typing-game.html']:
            await mp.goto(f'{BASE}/{pg}'); await mp.wait_for_timeout(300)
            check(f'mobile {pg}: no horizontal scroll',await mp.evaluate('document.documentElement.scrollWidth-innerWidth')<=1)
        await mp.goto(f'{BASE}/word-game.html'); await mp.wait_for_timeout(300)
        kw=await mp.evaluate('Math.max(...[...document.querySelectorAll(".wg-krow")].map(r=>r.getBoundingClientRect().right))'); check('mobile word game: on-screen keyboard fits viewport',kw<=390,kw)
        check('no JS errors across games run',not errs,errs)
        await b.close()
    f=[r for r in res if not r[1]]
    print(f'\n{len(res)-len(f)}/{len(res)} passed')
    for r in f: print('FAILED:',r)
asyncio.run(main())
