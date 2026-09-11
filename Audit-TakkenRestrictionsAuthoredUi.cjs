"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname);
function serve() {
  const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".webp":"image/webp"};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,"http://localhost");
    const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/$/,"/index.html").replace(/^\/+/,""));
    if(!target.startsWith(root+path.sep)) return res.writeHead(403).end();
    fs.readFile(target,(err,data)=>err ? res.writeHead(404).end() : res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream","cache-control":"no-store"}).end(data));
  });
  return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve({url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(done=>{server.closeAllConnections?.();server.close(done);})})));
}
const waitApp=page=>page.waitForFunction(()=>window.TAKKEN_RESTRICTIONS_AUTHORED_BANK?.QUESTIONS.length===72 && window.TAKKEN_SUBJECT_SPRINT_BANK?.QUESTIONS.length===198 && document.querySelector("#restrictionAuthoredTwenty"));
async function state(page,key) { return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key); }
async function expected(page,key) {
  return page.evaluate(k=>{
    const drill=JSON.parse(localStorage.getItem(k)).practicalDrill;
    const id=drill.queue[drill.position];
    const q=window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(id,drill.presentationOverrides?.[id]||drill.presentationKey);
    return {id:q.id,answer:q.answer,choices:q.choices,text:q.text,premise:q.premise,format:q.format,model:q.displayModel,facts:q.sourceFacts};
  },key);
}
async function setQuestion(page,key,id) {
  await page.evaluate(({key,id})=>{
    const save=JSON.parse(localStorage.getItem(key));
    save.practicalDrill={...save.practicalDrill,bankId:"subject-sprint",bankVersion:5,scope:"restrictions",planMode:"sprint",
      unitId:"subject-sprint-restrictions-authored",stage:"active",sessionSize:1,sessionIds:[id],queue:[id],position:0,
      presentationKey:"restriction58-ui",presentationOverrides:{},currentAttempt:null,preAnswerConfidence:"",preAnswerGrounding:{},
      retryIds:[],completedAt:""};
    localStorage.setItem(key,JSON.stringify(save));
  },{key,id});
  await page.reload({waitUntil:"networkidle"});
  await waitApp(page);
  await page.locator("#practicalDrillSession").waitFor({state:"visible"});
}
async function main() {
  const server=process.env.TAKKEN_BASE_URL ? {url:process.env.TAKKEN_BASE_URL,close:async()=>{}} : await serve();
  const browser=await chromium.launch(process.env.TAKKEN_CHROME_PATH ? {headless:true,executablePath:process.env.TAKKEN_CHROME_PATH}:{headless:true,channel:"chrome"});
  const errors=[];
  const shots=process.env.TAKKEN_AUDIT_SCREENSHOTS;
  if(shots) fs.mkdirSync(shots,{recursive:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},locale:"ja-JP",timezoneId:"Asia/Tokyo",reducedMotion:"reduce"});
    const page=await context.newPage();
    page.on("pageerror",e=>errors.push(String(e)));
    const review=`restriction58-${Date.now().toString(36)}`;
    const key=`takken-battle-study-clean-v2-hard-review-${review}`;
    const url=new URL(server.url);url.searchParams.set("review",review);url.searchParams.set("today","1");
    await page.goto(url.toString(),{waitUntil:"networkidle"});
    await waitApp(page);
    assert.match(await page.locator("#restrictionAuthoredTwenty").textContent(),/新作/);
    await page.locator("#restrictionAuthoredTwenty").click();
    await page.locator("#practicalDrillSession").waitFor({state:"visible"});
    const started=await state(page,key);
    assert.equal(started.practicalDrill.queue.length,20);
    assert.equal(new Set(started.practicalDrill.queue).size,20);
    assert.ok(started.practicalDrill.queue.every(id=>/^sprint-law-rc58-\d{3}$/.test(id)),"fresh CTA must exclude every legacy question");
    const anchors=await page.evaluate(ids=>ids.map(id=>window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id].sourceAnchor),started.practicalDrill.queue);
    anchors.forEach((a,i)=>{if(i>0)assert.notEqual(a,anchors[i-1]);if(i>1)assert.notEqual(a,anchors[i-2]);});
    assert.ok(new Set(anchors).size>=5,"fresh session should span the major laws");
    const first=await expected(page,key);
    await page.locator('[data-practical-forecast="confident"]').click();
    const unlocked=await state(page,key);
    await page.reload({waitUntil:"networkidle"});
    await waitApp(page);
    assert.equal((await state(page,key)).practicalDrill.preAnswerConfidence,unlocked.practicalDrill.preAnswerConfidence,"pre-answer forecast retained");
    assert.deepEqual((await state(page,key)).practicalDrill.queue,started.practicalDrill.queue);
    await page.locator(".practical-drill-choice").nth(first.answer).click();
    await page.locator("#practicalDrillFeedback").waitFor({state:"visible"});
    const answered=await state(page,key);
    assert.equal(answered.practicalDrill.currentAttempt.correct,true);
    await page.reload({waitUntil:"networkidle"});await waitApp(page);
    const restored=await state(page,key);
    assert.deepEqual(restored.practicalDrill.currentAttempt,answered.practicalDrill.currentAttempt,"selected option retained after reload");
    assert.deepEqual(restored.practicalDrill.history,answered.practicalDrill.history,"history retained after reload");
    assert.deepEqual((await expected(page,key)).choices,first.choices,"presentation retained after reload");
    // Exercise all formats and both ask directions, then fill out the six legal subjects.
    const samples=await page.evaluate(()=>{
      const rows=window.TAKKEN_RESTRICTIONS_AUTHORED_BANK.QUESTIONS;
      const ids=new Set();
      for(const format of ["single","count","combination"]) for(const ask of ["correct","incorrect"]) {
        const q=rows.find(q=>q.formatKey===format && q.ask===ask);if(q)ids.add(q.id);
      }
      for(const source of new Set(rows.map(q=>q.sourceAnchor))) ids.add(rows.find(q=>q.sourceAnchor===source).id);
      return [...ids].map(id=>`sprint-law-${id}`);
    });
    const exercised=[];
    for(const id of samples) {
      await setQuestion(page,key,id);
      const q=await expected(page,key);
      const promptPosition=await page.locator("#practicalDrillPrompt").evaluate(node=>({top:node.getBoundingClientRect().top,height:innerHeight}));
      assert.ok(promptPosition.top>=0 && promptPosition.top<promptPosition.height-68,`${id}: start at the premise, not the controls below the statements`);
      assert.ok((await page.locator("#practicalDrillPrompt").textContent()).includes(q.premise),`${id}: common premise visible`);
      const actual=await page.locator(".practical-drill-choice").evaluateAll(nodes=>nodes.map(n=>n.querySelector(".practical-choice-judgment")?.textContent || n.textContent.replace(/^\d+\.\s*/,"")));
      assert.deepEqual(actual,q.choices,`${id}: visible options match grading options`);
      if(q.format!=="単一選択") {
        assert.equal(await page.locator(".practical-prompt-items [role=listitem]").count(),4,`${id}: all four statements rendered`);
        for(const fact of q.facts) assert.ok((await page.locator("#practicalDrillPrompt").textContent()).includes(fact.statement),`${id}: statement visible`);
      }
      for(const width of [1280,390,320]) {
        await page.setViewportSize({width,height:900});
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
          buttons:[...document.querySelectorAll(".practical-drill-choice")].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,clipped:n.scrollWidth>n.clientWidth+1}))}));
        assert.ok(layout.overflow<=1,`${id}/${width}: no horizontal overflow`);
        assert.ok(layout.buttons.every(b=>b.height>=44 && b.width>=200 && !b.clipped),`${id}/${width}: readable answer controls`);
        if(shots && (id===samples[0] || (width===390 && !exercised.some(e=>e.format===q.format)))) {
          await page.locator("#practicalDrillSession").screenshot({path:path.join(shots,`${id}-${width}.png`)});
        }
      }
      await page.setViewportSize({width:390,height:844});
      await page.locator('[data-practical-forecast="confident"]').click();
      assert.equal(await page.locator(".practical-drill-choice:enabled").count(),4);
      await page.locator(".practical-drill-choice").nth(q.answer).click();
      await page.locator("#practicalDrillFeedback").waitFor({state:"visible"});
      assert.equal((await state(page,key)).practicalDrill.currentAttempt.correct,true,`${id}: correct answer grading`);
      assert.ok((await page.locator("#practicalDrillReasoning").textContent()).length>40,`${id}: explanation visible`);
      const reviewCards=page.locator(".practical-statement-review-card");
      assert.equal(await reviewCards.count(),4,`${id}: four independent fact explanations`);
      assert.deepEqual(await reviewCards.locator("header strong").allTextContents(),q.format==="単一選択"?["1","2","3","4"]:["ア","イ","ウ","エ"],`${id}: explanation labels match the displayed statements`);
      for(const [index,fact] of q.facts.entries()) {
        const copy=await reviewCards.nth(index).textContent();
        assert.ok(copy.includes(fact.statement) && copy.includes(fact.reason) && copy.includes(fact.sourceLocator),`${id}/${index}: fact, reason and legal locator aligned`);
      }
      assert.ok(await page.locator("#practicalDrillSources a").count(),`${id}: legal sources linked`);
      exercised.push({id,format:q.format});
    }
    // A version-5 legacy answer must survive this additive release too.
    await setQuestion(page,key,"sprint-law-rs002");
    const old=await expected(page,key);
    await page.locator('[data-practical-forecast="confident"]').click();
    await page.locator(".practical-drill-choice").nth(old.answer).click();
    const oldAnswered=await state(page,key);
    await page.reload({waitUntil:"networkidle"});await waitApp(page);
    assert.deepEqual((await state(page,key)).practicalDrill.currentAttempt,oldAnswered.practicalDrill.currentAttempt,"legacy v5 selected option retained");
    // The four new assets must be precached and the fresh route must work offline.
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload({waitUntil:"networkidle"});
    const cached=await page.evaluate(async()=>{
      const all=await caches.keys(); const results=await Promise.all(all.map(async name=>(await(await caches.open(name)).keys()).map(req=>req.url)));return results.flat();
    });
    for(const file of ["restrictions-cases-city-land.js","restrictions-cases-building-readjustment.js","restrictions-cases-agriculture-fill.js","restrictions-authored-bank.js"]) assert.ok(cached.some(url=>url.includes(file)),`${file}: offline precache`);
    await context.setOffline(true);
    await page.reload({waitUntil:"domcontentloaded"});await waitApp(page);
    assert.deepEqual((await state(page,key)).practicalDrill.currentAttempt,oldAnswered.practicalDrill.currentAttempt,"offline reload preserves legacy selected option");
    assert.equal(await page.evaluate(()=>window.TAKKEN_RESTRICTIONS_AUTHORED_BANK.QUESTIONS.length),72);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:"ok",freshQueue:20,legacyExcluded:true,sourcesInFirstSet:new Set(anchors).size,
      sampled:exercised,viewports:[1280,390,320],forecastAndAnswerReload:true,legacyV5AnswerReload:true,offlineAssets:4,errors},null,2));
  } finally {await browser.close();await server.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
