import test from 'node:test'
import assert from 'node:assert/strict'
import { splitDocument, moveSegment, durationOf, wordsAt } from '../src/editor/document.js'
const fixture=()=>({segments:[{id:'a',start:1,end:5}],words:[{id:'w1',start:1,end:2,text:'Uma'},{id:'w2',start:2,end:3,text:'legenda'},{id:'w3',start:3,end:4,text:'real'}],captions:{wordsPerLine:2}})
test('split and reorder preserve source intervals and total duration',()=>{
  const source=fixture(),split=splitDocument(source,'a',3,'b')
  assert.equal(source.segments.length,1)
  assert.equal(durationOf(split),4)
  const reordered=moveSegment(split,'b',-1)
  assert.deepEqual(reordered.segments.map(s=>[s.start,s.end]),[[3,5],[1,3]])
  assert.equal(durationOf(reordered),4)
})
test('split refuses a subframe near the boundary',()=>assert.throws(()=>splitDocument(fixture(),'a',1.01,'b')))
test('preview groups words by source timings and configured count',()=>{
  assert.deepEqual(wordsAt(fixture(),2.4).map(w=>w.text),['Uma','legenda'])
  assert.deepEqual(wordsAt(fixture(),3.5).map(w=>w.text),['real'])
})
