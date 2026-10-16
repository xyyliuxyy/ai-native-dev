'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),CLI=path.join(ROOT,'bin/ai-native-dev.cjs');
const lib=require('../runtime/aicp.cjs');
function run(c,a,cwd){return cp.spawnSync(c,a,{cwd,encoding:'utf8',timeout:30000});}
function git(root,...a){const r=run('git',a,root);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function cli(root,...a){return run('node',[CLI,...a,'--project',root],root);}
function fixture(opts={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-native-fixture-'));
  git(root,'init','-q');git(root,'config','user.email','tests@example.test');git(root,'config','user.name','Tests');
  const files=opts.files||{'README.md':'hello'};
  for(const [name,value] of Object.entries(files)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
  git(root,'add','.');git(root,'commit','-qm','initial');
  const r=cli(root,'install','--skip-matt');assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
  return root;
}
function cleanup(root){fs.rmSync(root,{recursive:true,force:true});}
function bypassMatt(root){const p=path.join(root,'.ai-native/policy.json'),obj=JSON.parse(fs.readFileSync(p));obj.enforce_matt_lock=false;fs.writeFileSync(p,JSON.stringify(obj,null,2));}
function jsFixture(){return fixture({files:{
  'package.json':JSON.stringify({name:'fixture',private:true,scripts:{'test:ci':'node --test tests/*.test.cjs','test:qa':'node --test qa_tests/*.test.cjs'}}),
  'package-lock.json':JSON.stringify({name:'fixture',lockfileVersion:3}),
  'math.cjs':'module.exports={ add:(x,y)=>x+y }\n',
  'tests/math.test.cjs':`const test=require('node:test'),assert=require('node:assert/strict');const m=require('../math.cjs');test('sum',()=>assert.equal(m.add(2,3),5));`,
  'qa_tests/math.test.cjs':`const test=require('node:test'),assert=require('node:assert/strict');const m=require('../math.cjs');test('boundary',()=>assert.equal(m.add(0,-3),-3));`
}});}
function qaAssessment(root){fs.mkdirSync(path.join(root,'.ai-native/qa'),{recursive:true});fs.writeFileSync(path.join(root,'.ai-native/qa/assessment.json'),JSON.stringify({reviewer:'ai-native-qa',spec_ref:'.ai-native/task.json',scenarios:[{name:'boundary',expected:'-3'}],findings:[],verdict:'pass'}));}

test('install creates native /ai-dev OpenCode command and persistent runtime without manual config',()=>{
 const root=fixture();try{
  assert.ok(fs.existsSync(path.join(root,'.opencode/commands/ai-dev.md')));
  const cmd=fs.readFileSync(path.join(root,'.opencode/commands/ai-dev.md'),'utf8');
  assert.match(cmd,/\$ARGUMENTS/); assert.match(cmd,/agent: build/);
  assert.ok(fs.existsSync(path.join(root,'.opencode/plugins/aicp-guard.js')));
  assert.ok(fs.existsSync(path.join(root,'.ai-native/tools/aicp.cjs')));
  assert.match(fs.readFileSync(path.join(root,'.github/workflows/ai-native-quality.yml'),'utf8'),/ai-native-quality/);
  assert.equal(cli(root,'install','--skip-matt').status,0,'idempotent installation');
 }finally{cleanup(root);}
});

test('auto detect recognizes real Node checks instead of empty placeholders',()=>{
 const root=jsFixture();try{
  const d=lib.detect(root);assert.equal(d.language,'javascript/typescript');assert.deepEqual(d.checks.test,['npm','run','test:ci']);assert.deepEqual(d.checks.qa,['npm','run','test:qa']);
 }finally{cleanup(root);}
});

test('unconfirmed business request cannot pass the gate',()=>{
 const root=jsFixture();try{
  bypassMatt(root);assert.equal(cli(root,'plan','--task','update docs').status,0);
  assert.equal(cli(root,'run').status,0);
  assert.equal(cli(root,'gate').status,1);
 }finally{cleanup(root);}
});

test('low risk uses real check and GO; editing code invalidates results',()=>{
 const root=jsFixture();try{
  bypassMatt(root);
  assert.equal(cli(root,'plan','--task','调整文档说明','--acceptance','文档内容更新','--accepted').status,0);
  assert.equal(cli(root,'run').status,0);
  const gate=cli(root,'gate');assert.equal(gate.status,0,gate.stdout+gate.stderr);
  fs.appendFileSync(path.join(root,'math.cjs'),'\n// changed after verified\n');
  assert.equal(cli(root,'gate').status,1);
 }finally{cleanup(root);}
});

test('high risk needs real QA report and security runner; absent tool returns NO-GO',()=>{
 const root=jsFixture();try{
  bypassMatt(root);
  assert.equal(cli(root,'plan','--task','修改退款金额规则','--accepted').status,0);
  const result=cli(root,'run');assert.equal(result.status,1);
  const evidence=JSON.parse(fs.readFileSync(path.join(root,'.ai-native/reports/execution.json')));
  assert.equal(evidence.risk.level,'high');assert.equal(evidence.checks.test.status,'pass');assert.equal(evidence.checks.qa.status,'pass');assert.equal(evidence.checks.security.status,'missing');
  assert.equal(cli(root,'gate').status,1);
 }finally{cleanup(root);}
});

test('medium risk requires QA artifact in addition to separate executable QA tests',()=>{
 const root=jsFixture();try{
  bypassMatt(root);
  assert.equal(cli(root,'plan','--task','开发一个新的 API 接口','--accepted').status,0);
  assert.equal(cli(root,'run').status,0);
  assert.match(cli(root,'gate').stdout,/QA/);
  qaAssessment(root);
  assert.equal(cli(root,'gate').status,1,'QA file added after verification changes fingerprint');
  assert.equal(cli(root,'run').status,0);
  assert.equal(cli(root,'gate').status,0);
 }finally{cleanup(root);}
});

test('Matt lock is enforced unless explicitly opted out for offline tests',()=>{
 const root=jsFixture();try{
  assert.equal(cli(root,'plan','--task','文档样式','--accepted').status,0);
  assert.equal(cli(root,'run').status,0);
  assert.match(cli(root,'gate').stdout,/Matt/);
 }finally{cleanup(root);}
});

test('installer preserves pre-existing files and refuses to overwrite changes',()=>{
 const root=fixture();try{
   fs.writeFileSync(path.join(root,'.opencode/commands/ai-dev.md'),'user content');
   assert.equal(cli(root,'install','--skip-matt').status,2);
   assert.equal(fs.readFileSync(path.join(root,'.opencode/commands/ai-dev.md'),'utf8'),'user content');
 }finally{cleanup(root);}
});

test('missing real JS tests do not become fake passing checks',()=>{
 const root=fixture({files:{'package.json':JSON.stringify({scripts:{test:'echo "Error: no test specified" && exit 1'}})}});
 try{bypassMatt(root);assert.equal(cli(root,'plan','--task','文档调整','--accepted').status,0);assert.equal(cli(root,'run').status,1);assert.equal(cli(root,'gate').status,1);}finally{cleanup(root);}
});

test('locally sourced Matt skills are version-locked and tampering blocks the gate',()=>{
  const root=jsFixture(),src=fs.mkdtempSync(path.join(os.tmpdir(),'fake-matt-source-'));
  try{
    git(src,'init','-q');git(src,'config','user.email','tests@example.test');git(src,'config','user.name','Tests');
    const f=path.join(src,'skills/engineering/tdd/SKILL.md');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'---\nname: tdd\ndescription: TDD test-only fixture\n---\n# TDD\n');
    git(src,'add','.');git(src,'commit','-qm','pinned skill');
    lib.installMatt(root,{source:src});
    let lock=JSON.parse(fs.readFileSync(path.join(root,'.ai-native/skills.lock.json')));
    assert.equal(lock.providers.matt.commit,git(src,'rev-parse','HEAD'));
    assert.equal(lock.providers.matt.skills[0],'tdd');
    assert.equal(lib.mattHealthy(root).ok,true);
    assert.equal(cli(root,'plan','--task','调整文档','--accepted').status,0);
    assert.equal(cli(root,'run').status,0);
    assert.equal(cli(root,'gate').status,0);
    fs.appendFileSync(path.join(root,'.agents/skills/tdd/SKILL.md'),'\nUnreviewed change');
    assert.equal(cli(root,'gate').status,1);
  }finally{cleanup(root);cleanup(src);}
});

test('offline fallback does not claim Matt installed when upstream is not available',()=>{
  const root=fixture();try{
    const lock=JSON.parse(fs.readFileSync(path.join(root,'.ai-native/skills.lock.json')));
    assert.equal(lock.providers.matt.commit,null);
    assert.match(cli(root,'doctor').stdout,/未安装/);
  }finally{cleanup(root);}
});
