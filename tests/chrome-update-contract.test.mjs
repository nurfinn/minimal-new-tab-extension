import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../newtab.js',import.meta.url),'utf8');
test('application offers neutral safety without installing update listeners',()=>{
  assert.match(source,/export const updateSafety/);
  for(const name of ['pendingFolderSelection','folderSelectionSaveInFlight','savingFolderRenameId','dragState','folderDragState','savingBackground']) {
    assert.match(source.slice(source.indexOf('export const updateSafety'),source.indexOf('const elements =')),new RegExp(name));
  }
  assert.doesNotMatch(source,/onUpdateAvailable|runtime\.reload/);
  assert.match(source,/activeUpdateOperations/);
  assert.match(source,/finally\s*\{\s*activeUpdateOperations -= 1/);
});
