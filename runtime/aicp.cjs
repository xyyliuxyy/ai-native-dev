'use strict';
/** Zero-dependency Node control runtime. User-facing orchestration lives in the OpenCode command. */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'), os=require('node:os');
const cp=require('node:child_process');
const SOURCE='https://github.com/mattpocock/skills.git';
const MATT=['grill-with-docs','to-spec','to-tickets','implement','implement-spec','tdd','code-review','setup-matt-pocock-skills'];
const RANK={low:0,medium:1,high:2};
function msg(...a){console.log('[ai-dev]',...a);}
function exists(p){return fs.existsSync(p);}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function writeJson(p,x){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');}
function sha(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function fileHash(p){return sha(fs.readFileSync(p));}
function run(command,args,cwd,opts={}){
  const executable=process.platform==='win32'&&['npm','pnpm','yarn','bun'].includes(command)?command+'.cmd':command;
  const useCmd=process.platform==='win32'&&executable.endsWith('.cmd');
  const r=cp.spawnSync(useCmd?'cmd.exe':executable,useCmd?['/d','/s','/c',executable,...args]:args,{cwd,encoding:'utf8',timeout:opts.timeout||20000,maxBuffer:8*1024*1024,env:{...process.env,...(opts.env||{})}});
  return {code:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error};
}
function requireOk(r,what){if(r.error || r.code!==0)throw new Error(what+': '+(r.stderr||r.error?.message||r.stdout||r.code).slice(-1500));return r.stdout.trim();}
function git(root,...a){const r=run('git',a,root);return r.code===0?r.stdout.trim():null;}
function rootOf(options){return path.resolve(options.project||'.');}
function state(root){return path.join(root,'.ai-native');}
function policyFile(root){return path.join(state(root),'policy.json');}
function taskFile(root){return path.join(state(root),'task.json');}
function lockFile(root){return path.join(state(root),'skills.lock.json');}
function sortedFiles(dir,base=dir){if(!exists(dir))return[];const list=[];for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('symlink not permitted in managed Skill: '+p);if(e.isDirectory())list.push(...sortedFiles(p,base));else if(e.isFile())list.push([path.relative(base,p).replaceAll('\\','/'),p]);}return list;}
function treeHash(dir){const h=crypto.createHash('sha256');for(const [rel,p] of sortedFiles(dir)){h.update(rel);h.update('\u0000');h.update(fs.readFileSync(p));}return h.digest('hex');}
function sameOrWrite(src,dest,options={}){fs.mkdirSync(path.dirname(dest),{recursive:true});const b=fs.readFileSync(src);if(exists(dest)){if(fs.readFileSync(dest).equals(b))return false;throw new Error('Existing file differs; refusing overwrite: '+dest);}fs.writeFileSync(dest,b);return true;}
function which(n){const cmd=process.platform==='win32'?'where':'which';const r=run(cmd,[n],process.cwd());return r.code===0?(r.stdout.split(/\r?\n/)[0]):null;}
function detect(root){
  const out={language:'unknown',packageManager:null,found:[],checks:{test:null,qa:null,security:null},ci:null,notes:[]};
  const pkgPath=path.join(root,'package.json');
  if(exists(pkgPath)){
    out.language='javascript/typescript';out.found.push('package.json');
    const pm=exists(path.join(root,'pnpm-lock.yaml'))?'pnpm':exists(path.join(root,'yarn.lock'))?'yarn':exists(path.join(root,'bun.lock'))||exists(path.join(root,'bun.lockb'))?'bun':'npm';
    out.packageManager=pm;const pkg=readJson(pkgPath);const scripts=pkg.scripts||{};
    const pick=names=>names.find(n=>typeof scripts[n]==='string'&&scripts[n].trim());
    const t=pick(['test:ci','test','unit','test:unit']);
    const q=pick(['test:qa','test:acceptance','test:e2e','e2e']);
    const scriptCmd=n=>pm==='npm'?['npm','run',n]:[pm,'run',n];
    if(t)out.checks.test=scriptCmd(t);
    if(q)out.checks.qa=scriptCmd(q);
    if(exists(path.join(root,'playwright.config.ts'))||exists(path.join(root,'playwright.config.js')))out.found.push('playwright config');
    if(!q)out.notes.push('QA 测试入口不存在；由独立 QA Agent 先编写验收测试并接入 test:qa 脚本');
  } else if(exists(path.join(root,'pyproject.toml'))||exists(path.join(root,'requirements.txt'))||exists(path.join(root,'pytest.ini'))){
    out.language='python';out.packageManager='pip';
    const py=which('python3')?'python3':which('python')?'python':process.platform==='win32'&&which('py')?'py':null;
    const hasTest=exists(path.join(root,'tests'))||exists(path.join(root,'test'));
    const hasQa=exists(path.join(root,'qa_tests'));
    if(py&&hasTest)out.checks.test=[py,'-m','pytest','-q','tests'];
    if(py&&hasQa)out.checks.qa=[py,'-m','pytest','-q','qa_tests'];
    if(!hasQa)out.notes.push('找不到 qa_tests；请由独立 QA Agent 编写独立验收测试');
  }
  if(which('semgrep'))out.checks.security=['semgrep','scan','--config','auto','--error','.'];
  if(exists(path.join(root,'.github/workflows')))out.ci='github-actions';
  if(!out.checks.test)out.notes.push('无法识别可运行单测命令，测试门禁将保持 NO-GO');
  if(!out.checks.security)out.notes.push('未检测到 Semgrep；高风险安全门禁不能通过');
  return out;
}
function policy(root){return readJson(policyFile(root));}
function cmdFor(root,name){const p=policy(root);const override=p.checks?.[name]?.argv;
  if(Array.isArray(override)&&override.length)return override;
  return detect(root).checks[name];
}
function task(root){if(!exists(taskFile(root)))return {description:'',accepted:false};return readJson(taskFile(root));}
function pathsForRisk(root){
  if(!git(root,'rev-parse','HEAD'))return [];
  const a=git(root,'status','--porcelain','--untracked-files=all')||'';
  const changes=a.split(/\r?\n/).filter(Boolean).map(line=>line.slice(3).replace(/^"|"$/g,''));
  const base=process.env.AICP_BASE_REF||(process.env.GITHUB_BASE_REF?'origin/'+process.env.GITHUB_BASE_REF:null);
  if(base){const b=git(root,'diff','--name-only',base+'...HEAD');if(b)changes.push(...b.split(/\r?\n/));}
  return [...new Set(changes.filter(x=> !x.startsWith('.ai-native/') && !x.startsWith('.agents/skills/') && !x.startsWith('.opencode/') && x!=='.github/workflows/ai-native-quality.yml'))];
}
function riskFor(p,description,files){const text=(description||'').toLowerCase(),filestr=files.join('\n').toLowerCase();const signals=[];let level='low';
  for(const t of p.risk.high_terms){if(text.includes(t.toLowerCase())){level='high';signals.push('高风险需求：'+t);}}
  for(const t of p.risk.high_paths){if(new RegExp(t,'i').test(filestr)){level='high';signals.push('高风险路径：'+t);}}
  if(level!=='high'){for(const t of p.risk.medium_terms){if(text.includes(t.toLowerCase())){level='medium';signals.push('中风险需求：'+t);}}
   for(const t of p.risk.medium_paths){if(new RegExp(t,'i').test(filestr)){level='medium';signals.push('中风险路径：'+t);}}}
  if(!text.trim()&&!files.length)return {level:'high',signals:['需求与变更范围均未知']};
  return {level,signals:signals.length?signals:['无匹配到高风险信号（启发式判断，需人工复核）']};
}
function fingerprint(root){
  const h=crypto.createHash('sha256');const paths=pathsForRisk(root);
  h.update(git(root,'rev-parse','HEAD')||'NO_HEAD');
  // Committed + staged + unstaged diffs, including untracked source; omit generated report and backup directory.
  const tracked=run('git',['ls-files','-co','--exclude-standard','-z'],root);
  if(tracked.code===0){
    const files=[...new Set(tracked.stdout.split('\0').filter(Boolean))].filter(x=>!x.startsWith('.ai-native/reports/')&&!x.startsWith('.ai-native/backups/')&&!x.includes('node_modules/')).sort();
    for(const f of files){const loc=path.join(root,f);if(!exists(loc)||!fs.statSync(loc).isFile())continue;h.update(f);h.update('\u0000');h.update(fileHash(loc));}
  }
  h.update(JSON.stringify(paths.sort()));
  return h.digest('hex');
}
function mattHealthy(root){const lock=readJson(lockFile(root)).providers?.matt;
  if(!lock?.commit||!(/^[0-9a-f]{40}$/.test(lock.commit))||!Array.isArray(lock.skills)||lock.skills.length===0)return {ok:false,detail:'Matt 未安装或未锁定可用 Skill'};
  for(const name of lock.skills||[]){const p=path.join(root,'.agents/skills',name);if(!exists(path.join(p,'SKILL.md')))return{ok:false,detail:name+' 缺失'};if(treeHash(p)!==lock.integrity?.[name])return{ok:false,detail:name+' 文件哈希与锁定记录不一致'};}
  return {ok:true,detail:'Matt: '+lock.commit.slice(0,12)+' ('+lock.skills.length+' skills)'};
}
function installMatt(root,opts={}){
  if(!which('git'))throw new Error('安装 Matt 需要 Git；可以 --skip-matt 离线安装控制入口');
  const lock=readJson(lockFile(root));const previous=lock.providers?.matt?.commit;
  if(previous&&!opts.upgrade){const status=mattHealthy(root);if(!status.ok)throw new Error(status.detail);msg(status.detail);return;}
  if(previous&&opts.upgrade&&!mattHealthy(root).ok)throw new Error('本地 Matt 已修改；拒绝覆盖');
  const td=fs.mkdtempSync(path.join(os.tmpdir(),'ai-native-matt-'));
  try{
    const src=path.join(td,'src');
    if(opts.source){const supplied=path.resolve(opts.source);const wanted=git(supplied,'rev-parse','HEAD');if(!wanted)throw new Error('Matt 源目录不是 Git 仓库'); if(git(supplied,'status','--porcelain'))throw new Error('Matt 源目录有未提交的修改');fs.cpSync(supplied,src,{recursive:true});}
    else {requireOk(run('git',['clone','--depth','1','--quiet',SOURCE,src],td,{timeout:150000}),'download Matt');}
    let commit=requireOk(run('git',['rev-parse','HEAD'],src),'read Matt SHA');
    if(opts.commit && opts.commit!==commit){
      if(opts.source)throw new Error('本地 Matt SHA 与指定提交不一致');
      requireOk(run('git',['fetch','--depth','1','origin',opts.commit],src,{timeout:120000}),'fetch approved commit');
      requireOk(run('git',['checkout','--quiet','--detach',opts.commit],src,{timeout:30000}),'checkout approved commit');
      commit=requireOk(run('git',['rev-parse','HEAD'],src),'verify approved commit');
      if(commit!==opts.commit)throw new Error('Matt SHA 与明确指定的提交不一致');
    }
    const stage=path.join(td,'stage');fs.mkdirSync(stage);const installed=[];
    const skillbase=path.join(src,'skills');
    function lookup(dir,name){if(!exists(dir))return null;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name===name&&exists(path.join(p,'SKILL.md')))return p;const found=lookup(p,name);if(found)return found;}}return null;}
    for(const name of MATT){const found=lookup(skillbase,name);if(!found){msg('Matt 未提供此 Skill，跳过：',name);continue;}if(exists(path.join(root,'.agents/skills',name))&&!lock.providers.matt.skills?.includes(name))throw new Error('存在未纳管的同名 Skill：'+name);
      fs.cpSync(found,path.join(stage,name),{recursive:true,filter:s=>{if(fs.lstatSync(s).isSymbolicLink())throw new Error('symlink blocked: '+s);return true;}});installed.push(name);
    }
    if(!installed.length)throw new Error('在 Matt 仓库中未找到预期 Skill；安装中止');
    const dest=path.join(root,'.agents/skills');fs.mkdirSync(dest,{recursive:true});
    if(previous){const backup=path.join(root,'.ai-native/backups/matt',previous.slice(0,12));if(exists(backup))throw new Error('备份目标已存在：'+backup);fs.mkdirSync(backup,{recursive:true});for(const name of lock.providers.matt.skills)fs.cpSync(path.join(dest,name),path.join(backup,name),{recursive:true});writeJson(path.join(backup,'skills.lock.json'),lock);}
    for(const name of lock.providers.matt.skills||[])fs.rmSync(path.join(dest,name),{recursive:true,force:true});
    for(const name of installed)fs.cpSync(path.join(stage,name),path.join(dest,name),{recursive:true});
    const lpath=path.join(src,'LICENSE');if(exists(lpath)){const to=path.join(root,'.ai-native/upstream','matt-LICENSE-'+commit.slice(0,12));sameOrWrite(lpath,to);}
    lock.providers.matt={repo:SOURCE,commit,skills:installed,integrity:Object.fromEntries(installed.map(name=>[name,treeHash(path.join(dest,name))])),installed_at:new Date().toISOString()};writeJson(lockFile(root),lock);
    msg('Matt 来源已锁定：',commit,'；安装',installed.length,'项 Skill（从未自动执行下载的脚本）');
  }finally{fs.rmSync(td,{recursive:true,force:true});}
}
function init(root,packageRoot,opts){
  if(!exists(root))throw new Error('项目目录不存在：'+root);if(!git(root,'rev-parse','--is-inside-work-tree'))throw new Error('请在 Git 项目目录安装（需要 Git 历史以提供可追溯证据）');
  const entries={
    'templates/orchestrator.SKILL.md':'.agents/skills/ai-native-orchestrator/SKILL.md',
    'templates/qa.SKILL.md':'.agents/skills/ai-native-qa/SKILL.md',
    'templates/opencode-qa.md':'.opencode/agents/ai-native-qa.md',
    'templates/opencode-guard.js':'.opencode/plugins/aicp-guard.js',
    'templates/ai-dev.command.md':'.opencode/commands/ai-dev.md',
    'templates/policy.json':'.ai-native/policy.json',
    'templates/skills.lock.json':'.ai-native/skills.lock.json',
    'runtime/aicp.cjs':'.ai-native/tools/aicp.cjs',
    'templates/reports.gitignore':'.ai-native/reports/.gitignore',
  };
  for(const [src,to] of Object.entries(entries)){
    const a=path.join(packageRoot,src), b=path.join(root,to);
    if(!exists(a))throw new Error('安装包文件不存在：'+a);
    if(exists(b)&&!fs.readFileSync(a).equals(fs.readFileSync(b)))throw new Error('检测到与安装包不同的文件，拒绝覆盖：'+to);
  }
  let count=0;for(const [src,to] of Object.entries(entries))count+=sameOrWrite(path.join(packageRoot,src),path.join(root,to))?1:0;
  const ci=generateCI(root); if(ci){const file=path.join(root,'.github/workflows/ai-native-quality.yml');if(!exists(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,ci);count++;}}
  msg('已安装',count,'个文件；OpenCode 命令：/ai-dev');
  if(opts.skip_matt){
    msg('离线安装：Matt 尚未接入；/ai-dev 可以开始对话，但完整门禁仍将 NO-GO');
  }else{
    try{installMatt(root);}catch(e){
      if(String(e.message).startsWith('download Matt:'))msg('Matt 暂时无法下载：',e.message,'\n/ai-dev 已就绪；联网后重新执行 install 即可补装。未接入 Matt 时门禁不会给出 GO。');
      else throw e;
    }
  }
  const d=detect(root);msg('项目检测：',d.language,d.packageManager||'',JSON.stringify(d.checks));
  msg('无需手填配置：在 OpenCode 输入 /ai-dev 开始需求对话');
}
function generateCI(root){
  const d=detect(root);
  let setup='      - uses: actions/setup-node@v4\n        with:\n          node-version: "22"\n';
  if(d.language==='javascript/typescript'){
    const pm=d.packageManager;
    if(pm==='pnpm')setup+='      - run: corepack enable && pnpm install --frozen-lockfile\n';
    else if(pm==='yarn')setup+='      - run: corepack enable && yarn install --immutable\n';
    else if(pm==='bun')setup+='      - uses: oven-sh/setup-bun@v2\n      - run: bun install --frozen-lockfile\n';
    else setup+=exists(path.join(root,'package-lock.json'))?'      - run: npm ci\n':'      - run: npm install\n';
  }else if(d.language==='python'){
    setup+='      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.12"\n      - run: |\n          if [ -f requirements-dev.txt ]; then pip install -r requirements-dev.txt; elif [ -f requirements.txt ]; then pip install -r requirements.txt; else echo "No requirements to install"; fi\n';
  }else setup+='      # TODO: Install project dependencies; unknown technology stack fails closed.\n';
  return `name: AI Native Quality Gate
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  quality:
    name: ai-native-quality
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
${setup}      - name: Run quality checks
        run: node .ai-native/tools/aicp.cjs run
      - name: Verify evidence
        if: always()
        run: node .ai-native/tools/aicp.cjs gate
      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ai-native-evidence
          path: .ai-native/reports/
          if-no-files-found: warn
`;
}

function plan(root,options){if(!exists(policyFile(root)))throw new Error('尚未安装；先运行 install');
  const description=options.task||'';if(!description.trim())throw new Error('需要任务描述；OpenCode /ai-dev 应通过交互先明确业务需求');
  const prev=task(root);const accepted=options.accepted===true;
  writeJson(taskFile(root),{description,acceptance:options.acceptance||'',accepted,created_at:new Date().toISOString()});
  const r=riskFor(policy(root),description,pathsForRisk(root));
  writeJson(path.join(state(root),'risk.json'),{...r,task:description,accepted});
  msg('任务记录成功；风险：',r.level,'；需求确认：',accepted?'已确认':'待确认');return 0;
}
function checkResults(root){const p=policy(root), t=task(root),d=detect(root);const r=riskFor(p,t.description||'',pathsForRisk(root));const required=p.profiles[r.level].required;return {r,required,detected:d,task:t};}
function execute(root){const {r,required,task:t}=checkResults(root),p=policy(root);if(!t.accepted)msg('需求尚未确认；测试可执行，但门禁一定 NO-GO');
  const evidence={schema:2,at:new Date().toISOString(),head:git(root,'rev-parse','HEAD'),fingerprint_before:fingerprint(root),task_sha:sha(Buffer.from(JSON.stringify(t))),policy_sha:fileHash(policyFile(root)),lock_sha:fileHash(lockFile(root)),risk:r,required,checks:{}};
  for(const name of required){const argv=cmdFor(root,name);if(!argv){evidence.checks[name]={status:'missing',reason:'真实执行命令未发现，需先准备可运行测试/工具'};msg(name,'未找到测试命令 → NO-GO');continue;}
    if(!Array.isArray(argv)||!argv.length||argv.some(x=>typeof x!=='string'||!x))throw new Error(name+' 检查命令不合法');
    const timeout=p.checks?.[name]?.timeout_seconds||240;msg('实际执行',name,argv.join(' '));const st=Date.now(),res=run(argv[0],argv.slice(1),root,{timeout:timeout*1000,env:{CI:'true',AICP_QA_MODE:name==='qa'?'independent':'standard'}});
    const status=res.error?'error':res.code===0?'pass':'fail';evidence.checks[name]={status,argv,exit_code:res.code,elapsed_ms:Date.now()-st,stdout_tail:res.stdout.slice(-4000),stderr_tail:res.stderr.slice(-4000),error:res.error?.message||null};
  }
  evidence.fingerprint_after=fingerprint(root);writeJson(path.join(state(root),'reports/execution.json'),evidence);
  const pass=required.every(n=>evidence.checks[n]?.status==='pass')&&evidence.fingerprint_before===evidence.fingerprint_after;
  msg(pass?'检查完成：全部命令运行成功':'检查不完整或失败；NO-GO','报告：.ai-native/reports/execution.json');return pass?0:1;
}
function gate(root){if(!git(root,'rev-parse','HEAD'))return {ok:false,reason:'项目尚未有 Git 提交'};
  const p=policy(root),t=task(root),file=path.join(state(root),'reports/execution.json');
  if(!t.description||!t.accepted)return {ok:false,reason:'业务需求尚未在交互中确认'};
  if(!exists(file))return {ok:false,reason:'没有实际执行报告'};
  const e=readJson(file);const r=riskFor(p,t.description,pathsForRisk(root)),req=p.profiles[r.level].required;
  if(e.fingerprint_before!==e.fingerprint_after||e.fingerprint_after!==fingerprint(root))return {ok:false,reason:'测试执行后项目文件已变化，报告失效'};
  if(e.head!==git(root,'rev-parse','HEAD')||e.policy_sha!==fileHash(policyFile(root))||e.lock_sha!==fileHash(lockFile(root))||e.task_sha!==sha(Buffer.from(JSON.stringify(t))))return {ok:false,reason:'代码、策略、锁文件或需求发生变化，需重跑'};
  if(RANK[e.risk?.level]<RANK[r.level])return {ok:false,reason:'原检查风险等级低于当前风险等级'};
  for(const c of req){if(!e.checks?.[c]||e.checks[c].status!=='pass')return {ok:false,reason:c+' 尚未通过真实命令验证'};}
  if(req.includes('qa')){
    const assessment=path.join(state(root),'qa/assessment.json');
    if(!exists(assessment))return {ok:false,reason:'缺少独立 QA 的结构化验收报告'};
    let a;try{a=readJson(assessment);}catch{return {ok:false,reason:'独立 QA 报告不能解析'};}
    if(a.reviewer!=='ai-native-qa'||a.verdict!=='pass'||!Array.isArray(a.scenarios)||!a.scenarios.length||typeof a.spec_ref!=='string'||!a.spec_ref.trim())return {ok:false,reason:'独立 QA 报告不完整或未通过'};
    if(Array.isArray(a.findings)&&a.findings.some(x=>x.severity==='critical'||x.severity==='high'||x.status==='open'))return {ok:false,reason:'独立 QA 存在未解决缺陷'};
  }
  if(p.enforce_matt_lock!==false){const m=mattHealthy(root);if(!m.ok)return {ok:false,reason:m.detail};}
  return {ok:true,reason:'当前需求、代码、检查与 Matt 锁定内容均已核对'};
}
function doctor(root){const d=detect(root),t=task(root),r=riskFor(policy(root),t.description,pathsForRisk(root));const m=mattHealthy(root);
  msg('项目：',root,'\n语言：',d.language,'\n包管理器：',d.packageManager||'未发现','\n风险：',r.level,'\nMatt：',m.detail);
  for(const [name,cmd]of Object.entries(d.checks))msg(name+':',cmd?cmd.join(' '):'尚未就绪');for(const n of d.notes)msg('提示：'+n);
  msg('GitHub 分支保护：需要仓库管理员在平台配置 Required Status Check（本地无法代替设置）');return 0;
}
function optsFrom(argv){const a={_:[]};for(let i=0;i<argv.length;i++){const x=argv[i];if(x.startsWith('--')){const key=x.slice(2).replaceAll('-','_');if(['skip_matt','accepted','upgrade','approve','json'].includes(key))a[key]=true;else a[key]=argv[++i];}else a._.push(x);}return a;}
async function main(argv,ctx={}){const opts=optsFrom(argv),cmd=opts._[0]||'help',root=rootOf(opts);const pkg=ctx.packageRoot||path.resolve(__dirname,'..');
  if(cmd==='install'){init(root,pkg,opts);return 0;}
  if(cmd==='plan'){return plan(root,opts);}
  if(cmd==='detect'){const d=detect(root);if(opts.json)console.log(JSON.stringify(d,null,2));else{msg('探测结果');console.log(JSON.stringify(d,null,2));}return 0;}
  if(cmd==='risk'){const t=task(root);const r=riskFor(policy(root),opts.task||t.description||'',pathsForRisk(root));console.log(JSON.stringify(r,null,2));return 0;}
  if(cmd==='doctor')return doctor(root);
  if(cmd==='run')return execute(root);
  if(cmd==='gate'){const out=gate(root);msg(out.ok?'GO':'NO-GO',out.reason);return out.ok?0:1;}
  if(cmd==='matt-check'){const local=mattHealthy(root);msg(local.detail);const rr=run('git',['ls-remote',SOURCE,'HEAD'],root,{timeout:30000});if(rr.code!==0){msg('不能连接 GitHub');return 2;}const sha=rr.stdout.split(/\s+/)[0];msg('上游 HEAD：',sha,'；更新需运行 matt-update --approve');return 0;}
  if(cmd==='matt-update'){if(!opts.approve)throw new Error('先审核更新变更，然后明确指定 --approve');installMatt(root,{upgrade:true,commit:opts.commit});return 0;}
  console.log('AI Native Dev\n  install [--project PATH] [--skip-matt]\n  plan --task "需求" --acceptance "验收标准" --accepted\n  detect | doctor | risk | run | gate\n  matt-check | matt-update --approve [--commit FULL_SHA]');return cmd==='help'?0:2;
}
module.exports={main,detect,riskFor,pathsForRisk,fingerprint,gate,installMatt,plan,init,policy,task,cmdFor,mattHealthy};
if(require.main===module){main(process.argv.slice(2),{packageRoot:path.resolve(__dirname,'..')}).then(x=>process.exitCode=x).catch(e=>{console.error('[ai-dev] ERROR:',e.message);process.exitCode=2;});}
