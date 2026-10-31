"""Expanded tools tests (logic + UI). Serve the site on :8000 first."""
import asyncio, os, re
from playwright.async_api import async_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
BASE='http://localhost:8000'
res=[]
def check(name,cond,detail=''):
    res.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail if not cond else '')
def close(a,b,t=1e-6): return abs(a-b)<=t

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':900}); page=await ctx.new_page()
        errs=[]; page.on('pageerror',lambda e:errs.append(str(e)))
        await page.goto(f'{BASE}/tools.html'); await page.wait_for_timeout(500)

        # ================= Terraform plan parser =================
        T=await page.evaluate(r'''(()=>{const P=DMTools2.parsePlan;
          const sample=`Terraform will perform the following actions:

  # aws_security_group.db will be updated in-place
  ~ resource "aws_security_group" "db" {
      ~ description = "old" -> "new"
    }

  # aws_db_instance.orders must be replaced
-/+ resource "aws_db_instance" "orders" {
      ~ identifier = "orders-old" -> "orders" # forces replacement
      ~ engine     = "postgres" -> "mysql" # forces replacement
    }

  # aws_cloudwatch_metric_alarm.cpu will be created
  + resource "aws_cloudwatch_metric_alarm" "cpu" {
    }

  # aws_s3_bucket.old_logs will be destroyed
  - resource "aws_s3_bucket" "old_logs" {
    }

Plan: 2 to add, 1 to change, 2 to destroy.`;
          const a=P(sample);
          const noSummary=P(sample.replace(/Plan:.*$/m,''));
          const ansi=P('\u001b[1m  # aws_db_instance.x will be destroyed\u001b[0m\n\u001b[1mPlan:\u001b[0m 0 to add, 0 to change, 1 to destroy.');
          const none=P('No changes. Your infrastructure matches the configuration.');
          const junk=P('hello world');
          const mod=P('  # module.db.aws_db_instance.this[0] will be destroyed\nPlan: 0 to add, 0 to change, 1 to destroy.');
          const ec2=P('  # aws_instance.web will be destroyed\nPlan: 0 to add, 0 to change, 1 to destroy.');
          const upd=P('  # aws_db_instance.main will be updated in-place\nPlan: 0 to add, 1 to change, 0 to destroy.');
          const data=P('  # data.aws_ami.x will be read during apply\n  # aws_instance.a will be created\n');
          const imp=P('Plan: 1 to import, 2 to add, 0 to change, 0 to destroy.');
          const sf=P('  # snowflake_database.analytics will be destroyed\nPlan: 0 to add, 0 to change, 1 to destroy.');
          const empty=P('');
          return {a:{add:a.add,change:a.change,destroy:a.destroy,crit:a.critical.map(r=>r.addr),verdict:a.verdict,forces:a.resources.find(r=>r.addr==='aws_db_instance.orders').forces,n:a.resources.length,actions:a.resources.map(r=>r.action)},
            ns:{add:noSummary.add,change:noSummary.change,destroy:noSummary.destroy},
            ansi:{destroy:ansi.destroy,verdict:ansi.verdict,addr:ansi.resources[0].addr},none:{nc:none.noChanges,v:none.verdict},junk:junk.verdict,
            mod:{type:mod.resources[0].type,risk:mod.resources[0].risk},ec2:{risk:ec2.resources[0].risk,v:ec2.verdict},upd:{risk:upd.resources[0].risk,v:upd.verdict},
            data:{n:data.resources.length,add:data.add},imp:{imports:imp.imports,add:imp.add},sf:sf.verdict,empty:empty.verdict}})()''')
        check('tf parse: summary counts 2 add / 1 change / 2 destroy',(T['a']['add'],T['a']['change'],T['a']['destroy'])==(2,1,2),T['a'])
        check('tf parse: 4 resources with correct actions',T['a']['actions']==['update','replace','create','destroy'],T['a']['actions'])
        check('tf parse: stateful destroy/replace flagged critical (db + bucket)',T['a']['crit']==['aws_db_instance.orders','aws_s3_bucket.old_logs'] and T['a']['verdict']=='critical',T['a'])
        check('tf parse: collects "forces replacement" attributes',T['a']['forces']==['identifier','engine'],T['a']['forces'])
        check('tf parse: derives counts when Plan line missing (replace = add+destroy)',(T['ns']['add'],T['ns']['change'],T['ns']['destroy'])==(2,1,2),T['ns'])
        check('tf parse: strips ANSI colour codes',T['ansi']['destroy']==1 and T['ansi']['verdict']=='critical' and T['ansi']['addr']=='aws_db_instance.x',T['ansi'])
        check('tf parse: "No changes" recognised as ok',T['none']['nc'] and T['none']['v']=='ok')
        check('tf parse: non-plan text -> unknown; empty -> unknown',T['junk']=='unknown' and T['empty']=='unknown')
        check('tf parse: module + index addresses resolve resource type',T['mod']['type']=='aws_db_instance' and T['mod']['risk']=='critical',T['mod'])
        check('tf parse: non-stateful destroy is only a warning',T['ec2']['risk']=='warning' and T['ec2']['v']=='warning',T['ec2'])
        check('tf parse: in-place update of a DB is "caution", verdict ok',T['upd']['risk']=='caution' and T['upd']['v']=='ok',T['upd'])
        check('tf parse: data sources are listed but not counted',T['data']['n']==2 and T['data']['add']==1,T['data'])
        check('tf parse: import count parsed',T['imp']['imports']==1 and T['imp']['add']==2,T['imp'])
        check('tf parse: snowflake database destroy is critical',T['sf']=='critical')

        # ================= RDS generator =================
        R=await page.evaluate('''(()=>{const g=DMTools2.rdsHcl,f=DMTools2.rdsFamily;
          const prod=g({name:'orders',engine:'postgres',version:'15.5',instanceClass:'db.r6g.xlarge',storage:200,env:'prod',multiAz:true,retention:14});
          const np=g({name:'My DB_1!',engine:'mysql',version:'8.0.35',env:'nonprod',multiAz:false,storage:5,retention:99});
          const weird=g({name:'9lives',engine:'mariadb',version:'10.11.6',env:'prod',storage:'abc'});
          return {prod,np,weird,fam:[f('postgres','15.5'),f('postgres','16'),f('mysql','8.0.35'),f('mariadb','10.11.6')]}})()''')
        P_,N_,W_=R['prod'],R['np'],R['weird']
        check('rds: family derived from engine/version',R['fam']==['postgres15','postgres16','mysql8.0','mariadb10.11'],R['fam'])
        check('rds prod: encryption, secrets manager, gp3, private',all(x in P_ for x in ['storage_encrypted = true','manage_master_user_password = true','storage_type      = "gp3"']) and re.search(r'publicly_accessible\s+= false',P_))
        check('rds prod: deletion protection + prevent_destroy + final snapshot',re.search(r'deletion_protection\s+= true',P_) and 'prevent_destroy = true' in P_ and 'final_snapshot_identifier' in P_ and re.search(r'skip_final_snapshot\s+= false',P_))
        check('rds prod: values flow through (class, storage, multi-az, retention)','db.r6g.xlarge' in P_ and 'allocated_storage = 200' in P_ and re.search(r'multi_az\s+= true',P_) and re.search(r'backup_retention_period\s+= 14',P_))
        check('rds nonprod: no deletion protection, skip final snapshot, no prevent_destroy',re.search(r'deletion_protection\s+= false',N_) and re.search(r'skip_final_snapshot\s+= true',N_) and 'prevent_destroy' not in N_)
        check('rds: name sanitised to valid identifier (My DB_1! -> my-db-1)','identifier     = "my-db-1-nonprod"' in N_,[l for l in N_.split('\n') if 'identifier' in l][:1])
        check('rds: storage floor 20GB and retention cap 35 days','allocated_storage = 20' in N_ and re.search(r'backup_retention_period\s+= 35',N_))
        check('rds: leading digits stripped; bad storage falls back to default',('"lives-prod"' in W_) and 'allocated_storage = 100' in W_ and 'mariadb10.11' in W_,[l for l in W_.split('\n') if 'identifier' in l or 'allocated' in l])
        check('rds: braces balanced',P_.count('{')==P_.count('}') and N_.count('{')==N_.count('}'))

        # ================= Snowflake =================
        S=await page.evaluate('''(()=>{const c=DMTools2.snowflakeCost;
          const base=c({size:'M',clusters:1,activeHours:6,resumes:20,suspendMin:5,days:22,price:3,storageTB:5,storagePrice:23});
          const L=c({size:'L',clusters:1,activeHours:6,resumes:20,suspendMin:5,days:22,price:3,storageTB:5,storagePrice:23});
          const zero=c({size:'XS'});const junk=c({size:'nope',clusters:'x'});
          const multi=c({size:'S',clusters:3,activeHours:2,resumes:0,suspendMin:5,days:10,price:2,storageTB:0,storagePrice:0});
          return {base,L,zero,junk,multi,sizes:DMTools2.SF_SIZES.map(s=>s[0]+':'+s[1]).join(',')}})()''')
        check('snowflake: credits/hour table XS..6XL doubles each size',S['sizes']=='XS:1,S:2,M:4,L:8,XL:16,2XL:32,3XL:64,4XL:128,5XL:256,6XL:512',S['sizes'])
        e_cr=4*(6+20*5/60)*22
        check('snowflake: monthly credits = cph x (active + idle) x days',close(S['base']['credits'],e_cr,1e-6),(S['base']['credits'],e_cr))
        check('snowflake: compute $2,024 + storage $115 = $2,139',close(S['base']['compute'],e_cr*3,1e-6) and S['base']['storage']==115 and close(S['base']['total'],e_cr*3+115,1e-6),S['base'])
        check('snowflake: 1-minute auto-suspend saving',close(S['base']['saving1MinSuspend'],(4*(20*4/60)*22)*3,1e-6),S['base']['saving1MinSuspend'])
        check('snowflake: idle share = 21.7%',close(S['base']['idleShare'],(20*5/60)/(6+20*5/60),1e-9))
        check('snowflake: resource monitor quota = ceil(110%)',S['base']['monitorQuota']==int(-(-e_cr*1.1//1)),S['base']['monitorQuota'])
        check('snowflake: L warehouse costs 2x the M warehouse',close(S['L']['credits']/S['base']['credits'],2,1e-9))
        check('snowflake: zero/invalid input gives no NaN',all(isinstance(S[k][f],(int,float)) and S[k][f]==S[k][f] for k in ['zero','junk'] for f in ['credits','total','annual','idleShare']),(S['zero'],S['junk']))
        check('snowflake: multi-cluster scales linearly (S x3 clusters x 2h x 10d = 120 credits)',close(S['multi']['credits'],2*3*2*10) and close(S['multi']['compute'],240))

        # ================= AWS savings =================
        A=await page.evaluate('''(()=>{const f=DMTools2.awsSavings;
          const a=f({rate:.5,count:4,hoursPerDay:12,daysPerWeek:5,discount:30,gb:2000,gp2:.1,gp3:.08,snapGB:5000,snapPrice:.05});
          const full=f({rate:1,count:1,hoursPerDay:24,daysPerWeek:7});
          const neg=f({gb:100,gp2:.05,gp3:.1});const junk=f({rate:'x',count:-3,hoursPerDay:99,daysPerWeek:99});
          return {a,full,neg,junk}})()''')
        check('aws: 24/7 baseline = rate x count x 730h = $1,460',close(A['a']['baseline'],1460))
        check('aws: schedule 12h x 5d = 260 h/mo, saves $940 (64%)',close(A['a']['scheduledHours'],260) and close(A['a']['schedSave'],940) and close(A['a']['schedPct'],940/1460*100,1e-6),A['a'])
        check('aws: commitment $438, gp3 $40, snapshots $250',close(A['a']['commitSave'],438) and close(A['a']['storageSave'],40) and close(A['a']['snapSave'],250))
        check('aws: combined excludes commitment: $1,230/mo, $14,760/yr',close(A['a']['combinedMonthly'],1230) and close(A['a']['combinedAnnual'],14760),A['a'])
        check('aws: 24/7 schedule saves ~nothing, never negative',A['full']['schedSave']>=0 and A['full']['schedSave']<5,A['full']['schedSave'])
        check('aws: gp3 dearer than gp2 gives 0 saving; junk input safe',A['neg']['storageSave']==0 and all(v==v for v in A['junk'].values()),A['junk'])

        # ================= CIDR =================
        C=await page.evaluate('''(()=>{const c=DMTools2.cidrPlan;
          const v=c('10.0.0.0/16',2),n=c('192.168.1.77/24',0),pub=c('8.8.8.0/24',0),s16=c('172.16.0.0/12',0),s32=c('172.32.0.0/16',0),
          p28=c('10.1.0.0/28',0),p29=c('10.1.0.0/29',0),big=c('10.0.0.0/26',3),all=c('0.0.0.0/0',0),
          bad=[c('999.1.1.1/8'),c('abc'),c('10.0.0.0/33'),c(''),c('10.0.0/16')].map(x=>!!x.error);
          return {v,n,pub,s16:s16.isPrivate,s32:s32.isPrivate,p28:[p28.total,p28.awsUsable,p28.validAwsSize],p29:p29.validAwsSize,big:{n:big.subnets.length,notes:big.notes},all:{t:all.total,b:all.broadcast},bad,ipRound:[DMTools2.int2ip(DMTools2.ip2int('10.20.30.40')),DMTools2.ip2int('0.0.0.1'),DMTools2.ip2int('1.2.3')]}})()''')
        v=C['v']
        check('cidr 10.0.0.0/16: 65,536 IPs, 65,531 usable in AWS',v['total']==65536 and v['awsUsable']==65531 and v['mask']=='255.255.0.0',v)
        check('cidr: AWS first/last usable and broadcast',v['firstUsable']=='10.0.0.4' and v['lastUsable']=='10.0.255.254' and v['broadcast']=='10.0.255.255',v)
        check('cidr: split /16 into 4 -> four /18 subnets',[s['cidr'] for s in v['subnets']]==['10.0.0.0/18','10.0.64.0/18','10.0.128.0/18','10.0.192.0/18'],v['subnets'])
        check('cidr: subnet usable = 16,379 and first usable +4',v['subnets'][0]['usable']==16379 and v['subnets'][1]['first']=='10.0.64.4' and v['subnets'][3]['last']=='10.0.255.254',v['subnets'])
        check('cidr: host bits normalised (192.168.1.77/24 -> .0), /24 has 251 usable',C['n']['network']=='192.168.1.0' and C['n']['normalized'] and C['n']['awsUsable']==251,C['n'])
        check('cidr: RFC1918 detection (10/8, 172.16/12 yes; 172.32 and 8.8.8.0 no)',C['v']['isPrivate'] and C['s16'] is True and C['s32'] is False and C['pub']['isPrivate'] is False)
        check('cidr: /28 = 16 IPs, 11 usable; /29 flagged invalid for AWS',C['p28']==[16,11,True] and C['p29'] is False,C['p28'])
        check('cidr: cannot split past /28 (note, no subnets)',C['big']['n']==0 and any('/28' in n for n in C['big']['notes']),C['big'])
        check('cidr: /0 edge works',C['all']['t']==4294967296 and C['all']['b']=='255.255.255.255',C['all'])
        check('cidr: invalid inputs all rejected',all(C['bad']),C['bad'])
        check('cidr: ip <-> int round trip and invalid ip null',C['ipRound'][0]=='10.20.30.40' and C['ipRound'][1]==1 and C['ipRound'][2] is None,C['ipRound'])

        # ================= PostgreSQL memory + autovacuum =================
        M=await page.evaluate('''(()=>{const m=DMTools2.memBudget,
          ok=m({ramGB:32,sharedBuffersGB:8,maxConn:200,workMemMB:16,nodes:2,perConnMB:8,maintMB:512,autovacWorkers:3,osReservePct:10,activePct:25}),
          warn=m({ramGB:16,sharedBuffersGB:4,maxConn:300,workMemMB:32,nodes:2,perConnMB:8,maintMB:512,autovacWorkers:3,osReservePct:10,activePct:25}),
          bad=m({ramGB:8,sharedBuffersGB:2,maxConn:500,workMemMB:64,nodes:2,perConnMB:8,maintMB:512,autovacWorkers:3,osReservePct:10,activePct:25}),
          tiny=m({ramGB:1,sharedBuffersGB:4,maxConn:100,workMemMB:4}),junk=m({})
          ;return {ok,warn,bad,tiny,junk}})()''')
        check('mem: roomy server -> ok; worst case 17,728 MB',M['ok']['status']=='ok' and close(M['ok']['worstMB'],17728) and close(M['ok']['typicalMB'],12928),M['ok'])
        check('mem: safe work_mem = ((usable-fixed)/conn-overhead)/nodes = 45.4MB',close(M['ok']['safeWorkMemMB'],((32768*0.9-9728)/200-8)/2,1e-6),M['ok']['safeWorkMemMB'])
        check('mem: worst case over RAM but typical fits -> warn',M['warn']['status']=='warn',M['warn'])
        check('mem: typical over RAM -> bad',M['bad']['status']=='bad',M['bad'])
        check('mem: safe work_mem never negative; junk input has no NaN',M['tiny']['safeWorkMemMB']==0 and all(v==v for v in M['junk'].values() if isinstance(v,(int,float))),M['tiny'])
        V=await page.evaluate('''(()=>{const a=DMTools2.autovac,d=a({rows:1e8,vsf:.2,vth:50,asf:.1,ath:50,isf:.2,ith:1000,targetPct:1,table:'public.orders'}),
          bad=a({rows:100,table:'x; DROP TABLE y'}),z=a({rows:0}),small=a({rows:1000,targetPct:1});return {d,bad:bad.sql.split('\\n')[0],z,small}})()''')
        d=V['d']
        check('autovac: defaults on 100M rows trigger at 20,000,050 dead rows (20%)',close(d['vacuumAt'],20000050) and close(d['analyzeAt'],10000050) and close(d['insertAt'],20001000) and close(d['vacuumPct'],20.00005,1e-4),d)
        check('autovac: 1% target gives scale factor 0.01, analyze 0.005',d['suggested']['vsf']==0.01 and d['suggested']['asf']==0.005 and d['suggested']['vth']==1000,d['suggested'])
        check('autovac: SQL uses the table name; unsafe name replaced',"ALTER TABLE public.orders SET" in d['sql'] and V['bad']=='ALTER TABLE my_table SET (')
        check('autovac: zero / tiny tables handled without NaN or negatives',all(v==v for v in V['z'].values() if isinstance(v,(int,float))) and V['small']['suggested']['vsf']>=0)

        # ================= Burn rate, backup, cron =================
        B=await page.evaluate('''(()=>{const r=DMTools2.burnRates,x=r(99.9,30),y=r(99.99,30),w=r(99.9,7),y2=r(99.95,30);
          return {rates:x.map(a=>a.burnRate),err:x.map(a=>a.errorRatio),err4:y.map(a=>a.errorRatio),sev:x.map(a=>a.sev),win:x.map(a=>a.long+'/'+a.short),w7:w[0].burnRate,y2:y2[0].errorRatio,
           yaml:DMTools2.promRules(99.9,30)}})()''')
        check('burn: 99.9%/30d -> 14.4x, 6x, 1x (page, page, ticket)',B['rates']==[14.4,6,1] and B['sev']==['page','page','ticket'] and B['win']==['1h/5m','6h/30m','3d/6h'],B)
        check('burn: error ratio = rate x budget (0.0144, 0.006, 0.001)',all(close(a,b,1e-9) for a,b in zip(B['err'],[0.0144,0.006,0.001])),B['err'])
        check('burn: 99.99% -> 0.00144 first threshold',close(B['err4'][0],0.00144,1e-9))
        check('burn: 7-day window scales burn rate (3.36x)',close(B['w7'],3.36,1e-9),B['w7'])
        check('burn: Prometheus YAML has all three alerts and thresholds',all(x in B['yaml'] for x in ['ErrorBudgetBurn1HOver5M','ErrorBudgetBurn6HOver30M','ErrorBudgetBurn3DOver6H','severity: page','severity: ticket','> 0.0144','> 0.006','> 0.001','groups:']))
        K=await page.evaluate('''(()=>{const b=DMTools2.backupPlan,x=b({sizeGB:500,changePct:5,retention:14,fullEvery:7,compression:.5,price:.023,restoreMBps:200,replayMBps:50,validateMin:15}),z=b({}),j=b({sizeGB:'x',compression:9,fullEvery:0});return {x,z,j}})()''')
        k=K['x']
        check('backup: 3 fulls, 750 GB fulls + 175 GB incrementals = 925 GB',k['fulls']==3 and close(k['fullGB'],750) and close(k['incrGB'],175) and close(k['totalGB'],925),k)
        check('backup: monthly cost = 925 GB x $0.023',close(k['monthlyCost'],925*0.023,1e-9))
        check('backup: restore 42.7 min + replay 29.9 min + 15 = RTO 87.5 min',close(k['restoreMin'],500*1024/200/60,1e-9) and close(k['replayMin'],87.5*1024/50/60,1e-9) and close(k['rtoMin'],k['restoreMin']+k['replayMin']+15,1e-9),k)
        check('backup: zero/junk input safe (no NaN, no divide by zero)',all(v==v and abs(v)!=float('inf') for v in list(K['z'].values())+list(K['j'].values())),(K['z'],K['j']))
        Q=await page.evaluate('''(()=>{const n=(e,from,c)=>DMTools2.cronNext(e,new Date(from),c).map(d=>d.toISOString().slice(0,16));const F=Date.UTC(2026,0,1,0,0);
          return {q15:n('*/15 * * * *',F,5),daily:n('0 2 * * *',F,3),leap:n('0 0 29 2 *',F,1),orDow:n('0 0 13 * 5','2026-02-01T00:00:00Z',3),wk:n('30 1 * * 1-5','2026-01-02T02:00:00Z',2),
            sun7:n('0 0 * * 7',F,1),sunName:n('0 0 * * SUN',F,1),mon:n('0 12 * JAN,MAR *','2026-02-01T00:00:00Z',1),never:n('0 0 31 2 *',F,1),step:n('0 0 1 */3 *',F,3),range:n('10-12 3 * * *',F,3),
            errs:['* * * *','61 * * * *','*/0 * * * *','a b c d e','0 24 * * *','0 0 32 * *','0 0 * 13 *','5-1 * * * *','1,,2 * * * *'].map(e=>!!DMTools2.cronParse(e).error),
            eb:['0 2 * * *','30 1 * * 1-5','0 0 1 * *','0 3 * * SUN','0 0 * * 0,6','*/5 * * * *','0 0 1 * 1'].map(e=>DMTools2.toEventBridge(e)),ebBad:DMTools2.toEventBridge('nope').error}})()''')
        check('cron: */15 gives 00:15 .. 01:15',Q['q15']==['2026-01-01T00:15','2026-01-01T00:30','2026-01-01T00:45','2026-01-01T01:00','2026-01-01T01:15'],Q['q15'])
        check('cron: daily 02:00',Q['daily']==['2026-01-01T02:00','2026-01-02T02:00','2026-01-03T02:00'],Q['daily'])
        check('cron: Feb 29 finds the next leap day (2028)',Q['leap']==['2028-02-29T00:00'],Q['leap'])
        check('cron: day-of-month + day-of-week are ORed (13th OR Friday)',Q['orDow']==['2026-02-06T00:00','2026-02-13T00:00','2026-02-20T00:00'],Q['orDow'])
        check('cron: weekdays skip the weekend',Q['wk']==['2026-01-05T01:30','2026-01-06T01:30'],Q['wk'])
        check('cron: Sunday as 7 and SUN both work',Q['sun7']==['2026-01-04T00:00'] and Q['sunName']==['2026-01-04T00:00'],(Q['sun7'],Q['sunName']))
        check('cron: month names and lists',Q['mon']==['2026-03-01T12:00'],Q['mon'])
        check('cron: impossible date (31 Feb) returns nothing instead of hanging',Q['never']==[],Q['never'])
        check('cron: month steps (*/3 -> Apr, Jul, Oct)',Q['step']==['2026-04-01T00:00','2026-07-01T00:00','2026-10-01T00:00'],Q['step'])
        check('cron: minute range 10-12',Q['range']==['2026-01-01T03:10','2026-01-01T03:11','2026-01-01T03:12'],Q['range'])
        check('cron: all 9 malformed expressions rejected',all(Q['errs']),Q['errs'])
        eb=[e['expr'] for e in Q['eb']]
        check('cron->EventBridge conversions',eb==['cron(0 2 * * ? *)','cron(30 1 ? * MON-FRI *)','cron(0 0 1 * ? *)','cron(0 3 ? * SUN *)','cron(0 0 ? * SUN,SAT *)','cron(*/5 * * * ? *)','cron(0 0 1 * ? *)'],eb)
        check('cron->EventBridge: ambiguous both-day case is flagged; bad input errors',bool(Q['eb'][6]['note']) and bool(Q['ebBad']),(Q['eb'][6],Q['ebBad']))

        # ================= UI: toolbar =================
        vis=lambda: page.evaluate('[...document.querySelectorAll(".tool-card[data-cat]")].filter(c=>!c.hidden).map(c=>c.id)')
        check('ui: 13 tools shown and counted',len(await vis())==13 and '13 tools' in await page.inner_text('#tools-count'))
        async def cat(c): await page.click(f'[data-tcat="{c}"]'); await page.wait_for_timeout(100); return await vis()
        tf=await cat('terraform'); check('ui: Terraform filter -> 2 tools',sorted(tf)==['t-terraform-plan','t-terraform-rds'],tf)
        aw=await cat('aws'); check('ui: AWS filter -> 5 tools',len(aw)==5 and 't-cidr' in aw and 't-aws-savings' in aw,aw)
        sf=await cat('snowflake'); check('ui: Snowflake filter -> 1 tool',sf==['t-snowflake'],sf)
        pg=await cat('postgresql'); check('ui: PostgreSQL filter -> 5 tools',len(pg)==5 and 't-autovacuum' in pg and 'failover-tool' in pg,pg)
        rl=await cat('reliability'); check('ui: Reliability filter -> 5 tools',len(rl)==5 and 'slo-tool' in rl and 't-burn-rate' in rl,rl)
        await cat('all'); await page.fill('#tools-search','cidr'); await page.wait_for_timeout(100); check('ui: search "cidr" -> 1 tool',await vis()==['t-cidr'])
        await page.fill('#tools-search','zzzz'); await page.wait_for_timeout(100); check('ui: no match shows message',await vis()==[] and 'No tools match' in await page.inner_text('#tools-count'))
        await page.fill('#tools-search',''); await cat('terraform'); await page.fill('#tools-search','generator'); await page.wait_for_timeout(100)
        check('ui: category + search combine',await vis()==['t-terraform-rds'])
        await page.fill('#tools-search',''); await cat('terraform')
        await page.evaluate('location.hash="#t-snowflake"'); await page.wait_for_timeout(2000)
        check('ui: deep link resets filters and reveals hidden tool',await page.evaluate('!document.getElementById("t-snowflake").hidden') and await page.evaluate('document.querySelector("[data-tcat=all]").classList.contains("active")'))
        top=await page.evaluate('Math.round(document.getElementById("t-snowflake").getBoundingClientRect().top)')
        check('ui: deep link scrolls the tool into view, clear of the fixed navbar (top 60-140px)',60<=top<=140,top)

        # ================= UI: each tool =================
        await page.goto(f'{BASE}/tools.html'); await page.wait_for_timeout(400)
        txt=lambda sel: page.inner_text(sel)
        await page.fill('#tf-input',''); await page.dispatch_event('#tf-input','input')
        check('tf ui: empty state prompts to paste','Paste the output' in await txt('#tf-verdict'))
        await page.click('#tf-sample'); await page.wait_for_timeout(100)
        check('tf ui: sample -> STOP verdict, critical styling','STOP' in await txt('#tf-verdict') and 'bad' in await page.get_attribute('#tf-verdict','class'))
        check('tf ui: counts 2 / 1 / 2 / 2',[x.strip() for x in (await txt('#tf-counts')).split('\n') if x.strip().isdigit()]==['2','1','2','2'],await txt('#tf-counts'))
        first=await page.inner_text('#tf-rows tr:first-child'); check('tf ui: critical rows sorted first',('aws_db_instance.orders' in first or 'aws_s3_bucket' in first) and 'CRITICAL' in first,first)
        await page.fill('#tf-input','  # <img/src=x/onerror=window.__xss=1> will be destroyed\nPlan: 0 to add, 0 to change, 1 to destroy.'); await page.wait_for_timeout(150)
        check('tf ui: pasted HTML is rendered as text (no XSS)',await page.locator('#tf-rows img').count()==0 and await page.evaluate('window.__xss')is None)
        await page.fill('#tf-input','hello'); await page.wait_for_timeout(100); check('tf ui: non-plan text explained','does not look like' in await txt('#tf-verdict'))
        await page.fill('#tf-input','No changes. Your infrastructure matches the configuration.'); await page.wait_for_timeout(100); check('tf ui: no changes message','No changes' in await txt('#tf-verdict') and 'good' in await page.get_attribute('#tf-verdict','class'))
        await page.click('#tf-clear'); check('tf ui: clear resets',(await page.input_value('#tf-input'))=='')
        o=await txt('#rd-output'); check('rds ui: default output generated','aws_db_instance' in o and 'postgres15' in o)
        await page.select_option('#rd-engine','mysql'); await page.fill('#rd-version','8.0.35'); await page.select_option('#rd-env','nonprod'); await page.wait_for_timeout(100)
        o=await txt('#rd-output'); check('rds ui: engine/version/env update output live','mysql8.0' in o and re.search(r'deletion_protection\s+= false',o) and 'prevent_destroy' not in o)
        await page.uncheck('#rd-multi'); o=await txt('#rd-output'); check('rds ui: multi-AZ checkbox',re.search(r'multi_az\s+= false',o))
        await ctx.grant_permissions(['clipboard-read','clipboard-write']); await page.click('#rd-copy'); await page.wait_for_timeout(200)
        check('rds ui: copy button copies HCL','aws_db_instance' in await page.evaluate('navigator.clipboard.readText()'))
        sfr=await txt('#sf-results'); check('snowflake ui: defaults -> 675 credits, $2,024, total $2,139','675' in sfr and '$2,024' in sfr and '$2,139' in sfr,sfr)
        await page.select_option('#sf-size','L'); sfr=await txt('#sf-results'); check('snowflake ui: size L doubles credits (1,349)','1,349' in sfr,sfr)
        check('snowflake ui: advice text mentions 1-minute auto-suspend saving and quota','1 minute' in await txt('#sf-note') and 'credits' in await txt('#sf-note'))
        await page.fill('#sf-active',''); await page.fill('#sf-resumes',''); await page.wait_for_timeout(100); check('snowflake ui: blank inputs do not show NaN','NaN' not in await txt('#sf-results'))
        awr=await txt('#aw-results'); check('aws ui: defaults -> schedule saves $940, yearly $14,760','$940' in awr and '$14,760' in awr,awr)
        await page.fill('#aw-hours','24'); await page.fill('#aw-days','7'); await page.wait_for_timeout(100); check('aws ui: always-on schedule saves only ~$4 (0%)','$4 (0%)' in await txt('#aw-results'),await txt('#aw-results'))
        cd=await txt('#cd-results'); check('cidr ui: default 10.0.0.0/16 results','65,531' in cd and '10.0.0.4' in cd,cd)
        check('cidr ui: default split gives 4 subnet rows',await page.locator('#cd-rows tr').count()==4)
        await page.select_option('#cd-split','6'); check('cidr ui: split into 64 rows',await page.locator('#cd-rows tr').count()==64)
        await page.fill('#cd-input','10.0.0.0/40'); await page.wait_for_timeout(100); check('cidr ui: invalid CIDR shows error',await page.locator('#cd-results .is-bad').count()==1)
        await page.fill('#cd-input','8.8.8.0/24'); await page.select_option('#cd-split','0'); await page.wait_for_timeout(100); check('cidr ui: public range warning','RFC 1918' in await txt('#cd-notes'))
        mb=await txt('#mb-note'); check('mem ui: default says worst case fits','fits' in mb,mb)
        await page.fill('#mb-work','200'); await page.wait_for_timeout(100); check('mem ui: big work_mem warns','exceeds' in await txt('#mb-note'),await txt('#mb-note'))
        avr=await txt('#av-results'); check('autovac ui: defaults 20,000,050 and SQL output','20,000,050' in avr and 'public.orders' in await txt('#av-output') and '0.01' in await txt('#av-output'),avr)
        await page.fill('#av-pct','0.5'); await page.wait_for_timeout(100); check('autovac ui: target % changes SQL','0.005' in await txt('#av-output'),await txt('#av-output'))
        check('burn ui: 3 rows and YAML',await page.locator('#br-rows tr').count()==3 and 'ErrorBudgetBurn1HOver5M' in await txt('#br-output'))
        await page.fill('#br-slo','99.99'); await page.wait_for_timeout(100); check('burn ui: 99.99 -> first row error ratio 0.144%','0.144%' in await page.inner_text('#br-rows tr:first-child'),await page.inner_text('#br-rows tr:first-child'))
        await page.fill('#br-slo','100'); await page.wait_for_timeout(100); check('burn ui: invalid SLO explained','between 0 and 100' in await txt('#br-output'))
        bk=await txt('#bk-results'); check('backup ui: 925 GB and RTO 1h 28m','925 GB' in bk and '1h 28m' in bk,bk)
        crt=await page.locator('#cr-out ol li').count(); check('cron ui: default shows 5 upcoming runs',crt==5)
        check('cron ui: EventBridge conversion shown','cron(*/15 * * * ? *)' in await txt('#cr-out'))
        await page.click('[data-cron="30 1 * * 1-5"]'); await page.wait_for_timeout(100); check('cron ui: preset chip fills input + converts',(await page.input_value('#cr-expr'))=='30 1 * * 1-5' and 'MON-FRI' in await txt('#cr-out'))
        await page.fill('#cr-expr','61 * * * *'); await page.wait_for_timeout(100); check('cron ui: invalid expression shows error',await page.locator('#cr-out .tool-error').count()==1)

        # ================= palette, a11y, responsive, errors =================
        await page.goto(f'{BASE}/index.html'); await page.wait_for_timeout(400)
        await page.keyboard.press('Control+k'); await page.keyboard.type('snowflake'); await page.keyboard.press('Enter'); await page.wait_for_url('**/tools.html#t-snowflake',timeout=4000)
        check('palette: "snowflake" opens that tool',page.url.endswith('/tools.html#t-snowflake'))
        await page.wait_for_timeout(800)
        unl=await page.evaluate('[...document.querySelectorAll(".tool-card input:not([type=range]), .tool-card select, .tool-card textarea, #tools-search")].filter(e=>!(e.closest("label")||e.getAttribute("aria-label")||(e.id&&document.querySelector("label[for="+e.id+"]")))).map(e=>e.id)')
        check('a11y: every tool input has a label or aria-label',unl==[],unl)
        ids=await page.evaluate('[...document.querySelectorAll("[id]")].map(e=>e.id)'); dup=[i for i in set(ids) if ids.count(i)>1]
        check('html: no duplicate element ids on tools page',dup==[],dup)
        mp=await ctx.new_page(); await mp.set_viewport_size({'width':390,'height':800}); await mp.goto(f'{BASE}/tools.html'); await mp.wait_for_timeout(500)
        await mp.click('#tf-sample'); await mp.select_option('#cd-split','6'); await mp.wait_for_timeout(200)
        check('mobile: tools page has no horizontal scroll (tables, code, textarea)',await mp.evaluate('document.documentElement.scrollWidth-innerWidth')<=1,await mp.evaluate('document.documentElement.scrollWidth-innerWidth'))
        check('mobile: toolbar chips wrap inside viewport',await mp.evaluate('Math.max(...[...document.querySelectorAll(".tools-cats .chip")].map(c=>c.getBoundingClientRect().right))')<=390)
        check('no JS errors on tools page',not errs,errs)
        await b.close()
    f=[r for r in res if not r[1]]
    print(f'\n{len(res)-len(f)}/{len(res)} passed')
    for r in f: print('FAILED:',r)
asyncio.run(main())
