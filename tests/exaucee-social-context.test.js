'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSocialContext, socialInstruction } = require('../ai_chat/cognition/socialContext');
const { ConversationThreads, looksLikeFollowup } = require('../ai_chat/cognition/conversationThreads');

test('extracts quoted author, quoted text and human mentions', () => {
  const msg = {
    pushName: 'Alice',
    key: { participant: '111@s.whatsapp.net', remoteJid: 'g@g.us' },
    message: { extendedTextMessage: {
      text: 'Et lui alors ?',
      contextInfo: {
        participant: '222@s.whatsapp.net',
        stanzaId: 'Q1',
        mentionedJid: ['333@s.whatsapp.net', '999@s.whatsapp.net'],
        quotedMessage: { conversation: 'Bob préfère Naruto.' }
      }
    } }
  };
  const social = extractSocialContext(msg, { botJids: ['999@s.whatsapp.net'] });
  assert.equal(social.speakerName, 'Alice');
  assert.equal(social.quoted.participant, '222@s.whatsapp.net');
  assert.match(social.quoted.text, /Bob préfère Naruto/);
  assert.deepEqual(social.mentionedHumans, ['333@s.whatsapp.net']);
  assert.equal(social.mentionsBot, true);
});

test('social instruction keeps speakers distinct', () => {
  const instruction = socialInstruction(
    { speakerName: 'Alice', quoted: { participantLabel: '222', text: 'Je suis Bob' }, mentionedHumans: ['333@s.whatsapp.net'] },
    ['human(Alice|111): J’aime One Piece', 'human(Bob|222): J’aime Naruto']
  );
  assert.match(instruction, /Alice/);
  assert.match(instruction, /Bob/);
  assert.match(instruction, /Ne mélange jamais/);
});

test('follow-up detector accepts conversational continuations but rejects unrelated long chatter', () => {
  assert.equal(looksLikeFollowup('Et pourquoi ?'), true);
  assert.equal(looksLikeFollowup('le deuxième'), true);
  assert.equal(looksLikeFollowup('Elle alors ?'), true);
  assert.equal(looksLikeFollowup('Je raconte maintenant une très longue histoire complètement différente '.repeat(10)), false);
});

test('conversation threads are isolated per user and per group', () => {
  const threads = new ConversationThreads({ ttlMs: 60000 });
  threads.touch('s1', 'g1@g.us', 'u1');
  assert.equal(threads.active('s1', 'g1@g.us', 'u1'), true);
  assert.equal(threads.active('s1', 'g1@g.us', 'u2'), false);
  assert.equal(threads.active('s1', 'g2@g.us', 'u1'), false);
  threads.close('s1', 'g1@g.us', 'u1');
  assert.equal(threads.active('s1', 'g1@g.us', 'u1'), false);
});
