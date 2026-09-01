import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateFederatedRecognitionView } from '../src/lib/federated-recognition-view.mjs';

const url=new URL('../../agent-commons/examples/federated-recognition-view.v1.json',import.meta.url);

test('federation path discovery never becomes transitive trust', async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validateFederatedRecognitionView(v);
  assert.equal(r.valid,true);
  assert.equal(r.automatic_transitive_trust,false);
  assert.equal(r.authority_effect,'none');
  assert.equal(r.adopted_edge_count,1);
  assert.equal(r.candidate_path_count,1);
});

test('candidate path cannot satisfy local recognition automatically', async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.candidate_paths[0].may_satisfy_local_recognition=true;
  assert.throws(()=>validateFederatedRecognitionView(v),/may not satisfy local recognition automatically/);
});

test('path existence cannot grant trust or authority', async()=>{
  for(const field of ['path_grants_trust','path_grants_authority','set_membership_grants_recognition']){
    const v=JSON.parse(await readFile(url,'utf8'));
    v.authority[field]=true;
    assert.throws(()=>validateFederatedRecognitionView(v),new RegExp(field));
  }
});
