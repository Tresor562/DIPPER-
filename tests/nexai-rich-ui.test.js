'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTikTokCard, renderSnakeCard, renderDominoCard, renderDashboardCard } = require('../utils/nexaiRichUi');

function png(buffer){assert.ok(Buffer.isBuffer(buffer));assert.ok(buffer.length>5000);assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);}

test('NexAI rich renderers produce valid PNG cards', async () => {
  png(await renderDashboardCard({session:'TEST'}));
  png(await renderSnakeCard({cols:16,rows:12,score:40,stage:2,best:80,speed:'normal',snake:[{x:7,y:6},{x:6,y:6},{x:5,y:6}],food:{x:10,y:6}}));
  png(await renderDominoCard({level:1,playerHand:[[0,1],[2,3],[4,4]],aiHand:[[1,1],[5,6]],chain:[[3,4],[4,6]],leftEnd:3,rightEnd:6,boneyardCount:14,status:'YOUR TURN'}));
  png(await renderTikTokCard({author:'Creator',username:'creator',views:1230000,likes:34000,comments:500,shares:1200,duration:18,title:'Demo video',music:'Original sound'}));
});
