"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const root=path.resolve(__dirname);
async function host(){
  const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json"};
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname).replace(/^\/$/,"/index.html");
    const file=path.resolve(root,pathname.replace(/^\/+/,""));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"}).end(data));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve);})};
}
const boot=page=>page.waitForFunction(()=>window.TAKKEN_TAX_AUTHORED_BANK?.QUESTIONS.length===24&&window.TAKKEN_SUBJECT_SPRINT_BANK?.QUESTIONS.length===198&&document.querySelector("#taxAuthoredTen"));
const saved=(page,key)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
const shown=(page,key)=>page.evaluate(k=>{
  const d=JSON.parse(localStorage.getItem(k)).practicalDrill,id=d.queue[d.position];
  const q=window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(id,d.presentationOverrides?.[id]||d.presentationKey);
  return {id:q.id,answer:q.answer,choices:q.choices,premise:q.premise,format:q.format,facts:q.sourceFacts};
},key);
async function answer(page,q){
  const forecast=page.locator('[data-practical-forecast="confident"]');
  if(await forecast.isVisible())await forecast.click();
  const choice=page.locator(".practical-drill-choice").nth(q.answer);
  assert.equal(await choice.isEnabled(),true,"tax question must not require an invisible pre-answer step");
  await choice.click();await page.locator("#practicalDrillFeedback").waitFor({state:"visible"});
  const confidence=page.locator('[data-practical-confidence="confident"]');
  if(await confidence.isVisible())await confidence.click();
}
async function seed(page,key,id){
  await page.evaluate(({key,id})=>{
    const s=JSON.parse(localStorage.getItem(key));
    s.practicalDrill={...s.practicalDrill,bankId:"subject-sprint",bankVersion:5,scope:"taxOther",planMode:"sprint",unitId:"subject-sprint-taxOther",
      stage:"active",sessionSize:1,sessionIds:[id],queue:[id],position:0,presentationKey:"tax59-ui:topic-authored:fixture",
      presentationOverrides:{},currentAttempt:null,preAnswerConfidence:"",retryIds:[],completedAt:""};
    localStorage.setItem(key,JSON.stringify(s));
  },{key,id});
  await page.reload({waitUntil:"networkidle"});await boot(page);
  await page.locator("#practicalDrillSession").waitFor({state:"visible"});
}
async function main(){
  const server=process.env.TAKKEN_BASE_URL?{url:process.env.TAKKEN_BASE_URL,close:async()=>{}}:await host();
  const browser=await chromium.launch(process.env.TAKKEN_CHROME_PATH?{headless:true,executablePath:process.env.TAKKEN_CHROME_PATH}:{headless:true,channel:"chrome"});
  const errors=[],shots=process.env.TAKKEN_AUDIT_SCREENSHOTS;
  if(shots)fs.mkdirSync(shots,{recursive:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},locale:"ja-JP",timezoneId:"Asia/Tokyo",reducedMotion:"reduce"});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(String(e)));
    const review=`tax59-${Date.now().toString(36)}`,key=`takken-battle-study-clean-v2-hard-review-${review}`;
    await page.goto(`${server.url}?review=${review}&today=1`,{waitUntil:"networkidle"});await boot(page);
    await page.locator("#passPlanPanel").evaluate(node=>node.open=true);
    assert.match(await page.locator("#taxRevisionGuide").textContent(),/2026年4月1日/);
    const guide=page.locator("#taxRevisionGuide");
    await guide.locator("summary").click();
    assert.equal(await guide.evaluate(node=>node.open),true);
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:900});
      const layout=await guide.evaluate(node=>({overflow:document.documentElement.scrollWidth-innerWidth,
        links:[...node.querySelectorAll("a")].map(a=>({height:a.getBoundingClientRect().height,url:a.href,rel:a.rel}))}));
      assert.ok(layout.overflow<=1,`open tax revision guide/${width}: overflow`);
      assert.equal(layout.links.length,4);
      assert.ok(layout.links.every(a=>a.height>=44&&a.url.startsWith("https://")&&a.rel.includes("noopener")),"official links must be visible, touch-sized and safe");
      if(shots)await guide.screenshot({path:path.join(shots,`tax-revision-guide-${width}.png`)});
    }
    await guide.locator("summary").click();
    await page.locator("#taxAuthoredTen").click();await page.locator("#practicalDrillSession").waitFor({state:"visible"});
    const start=await saved(page,key),ids=start.practicalDrill.queue;
    assert.equal(start.stateSchemaVersion,17);assert.equal(ids.length,10);assert.equal(new Set(ids).size,10);
    assert.ok(ids.every(id=>/^sprint-tax-tc59-\d{3}$/.test(id)),"new tax route must exclude old or other-subject IDs");
    const anchors=await page.evaluate(ids=>ids.map(id=>window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id].sourceAnchor),ids);
    const counts=anchors.reduce((o,a)=>(o[a]=(o[a]||0)+1,o),{});
    assert.equal(Object.keys(counts).length,5);assert.ok(Object.values(counts).every(n=>n===2),"each of five tax topics must have two questions");
    anchors.forEach((a,i)=>{if(i>0)assert.notEqual(a,anchors[i-1]);if(i>1)assert.notEqual(a,anchors[i-2]);});
    const first=await shown(page,key);await answer(page,first);
    const done=await saved(page,key);assert.equal(done.practicalDrill.currentAttempt.correct,true);
    await page.reload({waitUntil:"networkidle"});await boot(page);
    const restored=await saved(page,key);
    assert.deepEqual(restored.practicalDrill.queue,ids);assert.deepEqual(restored.practicalDrill.currentAttempt,done.practicalDrill.currentAttempt);
    assert.deepEqual(restored.practicalDrill.history,done.practicalDrill.history);assert.deepEqual((await shown(page,key)).choices,first.choices);
    const samples=await page.evaluate(()=>window.TAKKEN_TAX_AUTHORED_BANK.QUESTIONS.map(q=>`sprint-tax-${q.id}`));
    assert.equal(samples.length,24,"every authored tax case is covered by browser rendering and grading checks");
    const exercised=[];
    for(const id of samples){
      await seed(page,key,id);const q=await shown(page,key);
      const pos=await page.locator("#practicalDrillPrompt").evaluate(node=>({top:node.getBoundingClientRect().top,height:innerHeight}));
      assert.ok(pos.top>=0&&pos.top<pos.height-68,`${id}: begin at common premise`);
      assert.ok((await page.locator("#practicalDrillPrompt").textContent()).includes(q.premise));
      const options=await page.locator(".practical-drill-choice").evaluateAll(nodes=>nodes.map(n=>n.querySelector(".practical-choice-judgment")?.textContent||n.textContent.replace(/^\d+\.\s*/,"")));
      assert.deepEqual(options,q.choices);
      if(q.format!=="単一選択")assert.equal(await page.locator(".practical-prompt-items [role=listitem]").count(),4);
      for(const width of [1280,390,320]){
        await page.setViewportSize({width,height:900});
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
          choices:[...document.querySelectorAll(".practical-drill-choice")].map(n=>({height:n.getBoundingClientRect().height,clipped:n.scrollWidth>n.clientWidth+1}))}));
        assert.ok(layout.overflow<=1,`${id}/${width}: horizontal overflow`);
        assert.ok(layout.choices.every(c=>c.height>=44&&!c.clipped),`${id}/${width}: touch target or clipping`);
        if(shots&&(id===samples[0]||(width===390&&q.format!=="単一選択")))await page.locator("#practicalDrillSession").screenshot({path:path.join(shots,`${id}-${width}.png`)});
      }
      await answer(page,q);assert.equal((await saved(page,key)).practicalDrill.currentAttempt.correct,true);
      const cards=page.locator(".practical-statement-review-card");assert.equal(await cards.count(),4);
      assert.deepEqual(await cards.locator("header strong").allTextContents(),q.format==="単一選択"?["1","2","3","4"]:["ア","イ","ウ","エ"]);
      for(const [i,f] of q.facts.entries()){const copy=await cards.nth(i).textContent();assert.ok(copy.includes(f.statement)&&copy.includes(f.reason)&&copy.includes(f.sourceLocator),`${id}/${i}: reason or locator misalignment`);}
      assert.ok(await page.locator("#practicalDrillSources a").count());exercised.push({id,format:q.format});
    }
    // An answered old-tax question must remain answerable, not silently reset.
    await seed(page,key,"sprint-tax-t001");const legacy=await shown(page,key);await answer(page,legacy);
    const legacyAnswer=(await saved(page,key)).practicalDrill.currentAttempt;
    await page.reload({waitUntil:"networkidle"});await boot(page);
    assert.deepEqual((await saved(page,key)).practicalDrill.currentAttempt,legacyAnswer);
    // Retrying the new topic must retain the authored-only routing token.
    await seed(page,key,samples[0]);await answer(page,await shown(page,key));
    await page.locator("#practicalDrillNextButton").click();
    await page.locator("#practicalDrillRestartButton").click();
    const restarted=(await saved(page,key)).practicalDrill;
    assert.ok(restarted.queue.length>0&&restarted.queue.every(id=>/^sprint-tax-tc59-/.test(id)),"restart must not lose tax authored scope");
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:"networkidle"});
    const cached=await page.evaluate(async()=>(await Promise.all((await caches.keys()).map(async key=>(await(await caches.open(key)).keys()).map(r=>r.url)))).flat());
    for(const file of ["tax-cases-v59.js","tax-authored-bank.js"])assert.ok(cached.some(url=>url.includes(file)),`${file}: offline cache`);
    await context.setOffline(true);await page.reload({waitUntil:"domcontentloaded"});await boot(page);
    assert.deepEqual((await saved(page,key)).practicalDrill.queue,restarted.queue,"offline tax session survives");
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:"ok",newSet:10,topicCounts:counts,samples:exercised,viewports:[1280,390,320],revisionGuideLinks:4,answerReload:true,legacyTaxReload:true,newTopicRestart:true,offlineAssets:2,syntheticOnly:true}));
  }finally{await browser.close();await server.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
