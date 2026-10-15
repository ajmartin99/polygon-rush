import { describe, expect, it } from 'vitest';
import { filterChat } from '../src/shared/chat-filter';

const ok = [
  'gg that was close',
  'nice jump!',
  'lets build a castle here',
  'Can you add more gems at the end?',
  'where are you in the level',
  'follow me through the portal',
  'I have courage',
  'this is a slide',
  'class was fun today',
  'the raccoon level is cute',
  'done. me next',
  'one more race?',
  'level 12 is hard',
  'Essex is in England',
  'I love this game',
  'café is closed, nice level',
  'gg 🎉🔥',
];

const blocked: [string, string][] = [
  ['call me 555 123 4567', 'personal_info'],
  ['my number is five five five one two three four', 'personal_info'],
  ['email me at kid@example.com', 'personal_info'],
  ['kid (at) example (dot) com', 'personal_info'],
  ['go to www.example.com', 'link'],
  ['check coolsite.gg', 'link'],
  ['add me on snap', 'off_platform'],
  ['whats your discord', 'off_platform'],
  ['d i s c o r d', 'off_platform'],
  ['follow @coolkid99', 'off_platform'],
  ['dm me', 'off_platform'],
  ['how old are you', 'personal_question'],
  ['how old r u', 'personal_question'],
  ['where do u live', 'personal_question'],
  ['asl', 'personal_question'],
  ['what school do you go to', 'personal_question'],
  ['send a pic', 'personal_question'],
  ['dont tell your parents', 'personal_question'],
  ['123 Maple Street', 'personal_info'],
  ['kys', 'blocked_word'],
  ['go kill yourself', 'blocked_word'],
  ['s3xy', 'blocked_word'],
  ['f u c k', 'blocked_word'],
  ['how \u043eld are you', 'unsupported'],
  ['wh\u0435re do you live', 'unsupported'],
  ['\u0455n\u0430\u0440chat kidxyz', 'unsupported'],
  ['call \u0665\u0665\u0665\u0661\u0662\u0663\u0664\u0665\u0666\u0667', 'unsupported'],
  ['add me on d\u0131scord', 'off_platform'],
  ['wh\u00e9re do you l\u00efve', 'personal_question'],
  ['', 'empty'],
  ['x'.repeat(200), 'too_long'],
];

describe('free chat filter', () => {
  for (const text of ok) {
    it(`allows "${text}"`, () => {
      const r = filterChat(text);
      expect(r.ok, `${text} → ${r.reason}`).toBe(true);
    });
  }
  for (const [text, reason] of blocked) {
    it(`blocks "${text.slice(0, 30)}" (${reason})`, () => {
      const r = filterChat(text);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(reason);
    });
  }
  it('masks everyday swearing and calms SHOUTING', () => {
    expect(filterChat('this level is sh1t').text).toBe('this level is ****');
    expect(filterChat('WHAT A GREAT LEVEL').text).toBe('what a great level');
    expect(filterChat('wooooooow').text).toBe('wooow');
  });
  it('strips invisible characters and normalises look-alikes', () => {
    expect(filterChat('hi​ there').text).toBe('hi there');
    expect(filterChat('ｓｅｘｙ').ok).toBe(false);
  });
});
