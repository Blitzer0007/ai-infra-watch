import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_GROUPS, WORKSPACE_VIEWS, workspaceById, workspaceGroupById,
} from './workspaceNavigation';

const OLD_ROUTES = [
  'overview','opportunities','calendar','alerts','contracts','tracker',
  'congress','macro','portfolio','watchlist','research','jev-lab',
  'quality','outlook','health','guide','settings',
];

test('all 17 existing deep links remain in the application-wide navigation registry',()=>{
  const ids=WORKSPACE_VIEWS.map(item=>item.id);
  assert.equal(ids.length,17);
  assert.deepEqual([...ids].sort(),[...OLD_ROUTES].sort());
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(WORKSPACE_GROUPS.length,4);
});

test('every destination has exactly one valid group, a description and useful next workspaces',()=>{
  const groups=new Set(WORKSPACE_GROUPS.map(group=>group.id));
  const ids=new Set(WORKSPACE_VIEWS.map(item=>item.id));
  for(const view of WORKSPACE_VIEWS){
    assert(groups.has(view.group),view.id+' must belong to a group');
    assert(view.label.length>1);
    assert(view.description.length>20);
    assert(view.related.length>0&&view.related.length<=3);
    assert.equal(new Set(view.related).size,view.related.length);
    for(const dest of view.related){
      assert(ids.has(dest),view.id+' has an unknown next step '+dest);
      assert.notEqual(dest,view.id);
    }
    assert.equal(workspaceById(view.id),view);
    assert.equal(workspaceGroupById(view.group).id,view.group);
  }
});

test('invalid route metadata can only resolve to the existing Overview landing page',()=>{
  for(const id of [undefined,null,'../settings','/portfolio','unknown','']){
    assert.equal(workspaceById(id).id,'overview');
  }
});
