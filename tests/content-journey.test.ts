import assert from 'node:assert/strict';
import test from 'node:test';
import { contentJourney, resolveContentRun, safePublishedUrl, type JourneyRun, type JourneyVersion, type JourneyPublication } from '../lib/content-journey';
const run: JourneyRun = {id:'article',taskId:'task',status:'completed',title:'客户问题',keyword:'产品',wordCount:1200,qualityScore:80,reviewStatus:'approved',completedAt:1};
const v1: JourneyVersion = {id:'v1',runId:run.id,versionNumber:1,reviewStatus:'approved',qualityScore:80};
const v2: JourneyVersion = {...v1,id:'v2',versionNumber:2,reviewStatus:'draft'};
const publication: JourneyPublication = {id:'p1',contentTaskId:'task',versionId:'v1',connectionId:'site-a',title:run.title,status:'published',publishedUrl:'https://example.com/article',updatedAt:1};
test('a new draft is not marked published because an older version is live',()=>{
 const [row]=contentJourney([run],[v2,v1],[publication]);
 assert.equal(row.stage,'draft');assert.equal(row.version?.id,'v2');assert.equal(row.history.length,1);assert.equal(row.current.length,0);
});
test('publication failures on another channel stay actionable',()=>{
 const [row]=contentJourney([run],[v1],[publication,{...publication,id:'p2',connectionId:'site-b',status:'failed',updatedAt:2}]);
 assert.equal(row.stage,'failed');assert.equal(row.publishFailure,true);assert.equal(row.current.length,2);
});
test('one live channel and another waiting approval is still processing',()=>{
 assert.equal(contentJourney([run],[v1],[publication,{...publication,id:'p2',status:'awaiting_approval'}])[0].stage,'publishing');
});
test('failed verification remains actionable without losing the external URL',()=>{
 const [row]=contentJourney([run],[v1],[{...publication,verificationStatus:'failed'}]);assert.equal(row.stage,'failed');assert.equal(row.publishFailure,true);assert.equal(row.history[0].publishedUrl,publication.publishedUrl);
});
test('generated task IDs resolve to article IDs; stale selections fall back to existing content',()=>{
 assert.equal(resolveContentRun([run],'task'),'article');assert.equal(resolveContentRun([run],'missing','task'),'article');assert.equal(resolveContentRun([],'task'),'');
});
test('generation failure and running states cannot masquerade as editable completed drafts',()=>{
 assert.equal(contentJourney([{...run,status:'failed'}],[],[])[0].stage,'failed');assert.equal(contentJourney([{...run,status:'running'}],[v1],[publication])[0].stage,'generating');
});
test('latest version review controls the next step',()=>{
 assert.equal(contentJourney([run],[v1],[])[0].stage,'publish');assert.equal(contentJourney([run],[{...v2,reviewStatus:'pending'},v1],[])[0].stage,'review');assert.equal(contentJourney([run],[v1],[publication])[0].stage,'published');
});
test('records from another article cannot change the selected article status',()=>{
 assert.equal(contentJourney([run],[v1],[{...publication,contentTaskId:'another-task'}])[0].stage,'publish');
});
test('published links reject executable or malformed protocols',()=>{
 assert.equal(safePublishedUrl('javascript:alert(1)'),undefined);assert.equal(safePublishedUrl(null),undefined);assert.equal(safePublishedUrl('https://example.com/a'),'https://example.com/a');
});
