/**
 * Free Chat safety filter, shared by the app (instant feedback) and the
 * community server (the one that actually decides). Self-contained: no
 * imports, so the server can load this file directly.
 *
 * Blocks (message not sent):
 *  - personal info: phone-like numbers, emails, addresses, links, social handles
 *  - asking for or moving to other apps ("add me on snap", "dm me")
 *  - personal questions that groomers use ("how old are you", "where do you live")
 *  - slurs, sexual content and self-harm encouragement
 * Masks (sent with ***): everyday swear words.
 */

export const MAX_CHAT_LENGTH = 120;

export type FilterReason = 'empty' | 'too_long' | 'unsupported' | 'personal_info' | 'link' | 'off_platform' | 'personal_question' | 'blocked_word' | 'spam';

export interface FilterResult {
  ok: boolean;
  /** Cleaned text (masked) when ok. */
  text: string;
  reason?: FilterReason;
}

/** Friendly explanation shown to the sender. */
export const FILTER_MESSAGES: Record<FilterReason, string> = {
  empty: 'Type a message first.',
  too_long: `Keep it short (${MAX_CHAT_LENGTH} characters max).`,
  unsupported: 'Free Chat supports English letters, numbers and emoji only.',
  personal_info: 'Keep personal info private — no numbers, emails or addresses.',
  link: 'Links aren’t allowed in chat.',
  off_platform: 'Keep chats in the game — no other apps or usernames.',
  personal_question: 'Please don’t ask about age, location, school or photos.',
  blocked_word: 'That message isn’t allowed. Be kind!',
  spam: 'Slow down — that looks like spam.',
};

/** Control characters, zero-width and bidi marks (all written as escapes on purpose). */
const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff]', 'g');

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't', '€': 'e' };

/** Latin letters that don't decompose to a-z. */
const FOLD: Record<string, string> = { ı: 'i', ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ŧ: 't', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th', ð: 'd', ŋ: 'n', ĸ: 'k', ſ: 's', ɑ: 'a', ɡ: 'g', ʀ: 'r', ɪ: 'i', ʏ: 'y', ᴏ: 'o' };

/** Lower-case, strip accents, de-leet, letters only. */
function squash(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase().normalize('NFKD').replace(MARKS, '')) {
    const c = LEET[ch] ?? FOLD[ch] ?? ch;
    for (const x of c) if (x >= 'a' && x <= 'z') out += x;
  }
  return out;
}

const MARKS = new RegExp('\\p{M}', 'gu');
/** Any letter outside the Latin script (Cyrillic/Greek look-alikes would dodge the filter). */
const NON_LATIN_LETTER = new RegExp('(?![\\p{Script=Latin}])\\p{L}', 'u');
/** Digits other than 0-9 (e.g. Arabic-Indic) would dodge the phone check. */
const NON_ASCII_DIGIT = new RegExp('(?![0-9])\\p{Nd}', 'u');

/** Collapse "heeeeey" → "heey" so stretched words still match. */
function unstretch(s: string): string {
  return s.replace(/(.)\1{2,}/g, '$1$1');
}

// Severe: block the whole message. Matched as whole squashed words or prefixes.
const SEVERE_WORDS = [
  'nigger', 'nigga', 'niggas', 'faggot', 'fag', 'fags', 'retard', 'retarded', 'tranny', 'spic', 'chink', 'kike', 'wetback', 'coon',
  'rape', 'raped', 'rapist', 'porn', 'porno', 'sex', 'sexy', 'sexting', 'nude', 'nudes', 'naked', 'boobs', 'boobies', 'tits', 'titties',
  'penis', 'vagina', 'dildo', 'horny', 'orgasm', 'blowjob', 'handjob', 'cum', 'cumming', 'jizz', 'erection', 'onlyfans', 'hentai',
  'molest', 'pedo', 'pedophile', 'kys',
];
const SEVERE_PREFIXES = ['nigg', 'faggo', 'pornh', 'masturb', 'pedophil', 'molest'];
const SEVERE_PHRASES = ['killyourself', 'killurself', 'gokillyourself', 'hangyourself', 'cutyourself', 'endyourlife', 'unaliveyourself'];

// Mild: masked with asterisks.
const MILD_WORDS = [
  'fuck', 'fucking', 'fucker', 'fucked', 'fck', 'fuk', 'fk', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'cunt', 'dick', 'dickhead',
  'cock', 'pussy', 'asshole', 'ass', 'arse', 'bastard', 'slut', 'whore', 'damn', 'dammit', 'crap', 'wtf', 'stfu', 'piss', 'pissed', 'twat',
  'wanker', 'bollocks', 'prick', 'douche', 'motherfucker', 'mf', 'hoe', 'hoes', 'idiot', 'stupid', 'dumb', 'loser', 'ugly', 'fatso',
];
const MILD_PREFIXES = ['fuck', 'shit', 'bitch', 'cunt', 'motherf'];

const OFF_PLATFORM = [
  'snapchat', 'snap', 'sc', 'insta', 'instagram', 'ig', 'discord', 'disc', 'whatsapp', 'whatsap', 'telegram', 'kik', 'tiktok', 'facebook',
  'fb', 'messenger', 'skype', 'wechat', 'signal', 'twitter', 'reddit', 'youtube', 'twitch', 'roblox', 'xbox', 'psn', 'steam', 'email', 'gmail',
  'hotmail', 'outlook', 'icloud', 'yahoo',
];
const OFF_PLATFORM_PHRASES = [
  'addme', 'dmme', 'pmme', 'textme', 'callme', 'msgme', 'messageme', 'mynumber', 'urnumber', 'yournumber', 'phonenumber', 'whatsurnumber',
  'myusername', 'myuser', 'myhandle', 'friendme', 'myaccount', 'myinsta', 'mysnap', 'mydiscord',
];

/** Matched anywhere in the squashed message (long enough not to hit innocent words). */
const PERSONAL_QUESTIONS = [
  'howoldareyou', 'howoldru', 'howoldareu', 'howoldis', 'whatsyourage', 'whatsurage', 'whatisyourage', 'yourage', 'agepls',
  'whereyoulive', 'wheredoyoulive', 'whereulive', 'wheredoulive', 'whereareyoufrom', 'whereareufrom', 'whererufrom', 'whereufrom',
  'whatschool', 'whichschool', 'whatgrade', 'yourschool', 'urschool', 'youraddress', 'uraddress', 'myaddress', 'yourrealname',
  'urrealname', 'myrealname', 'whatsyourname', 'whatsurname', 'whatisyourname', 'areyouagirl', 'areuagirl', 'areyouaboy', 'areuaboy',
  'sendpic', 'sendapic', 'sendmeapic', 'sendphoto', 'facepic', 'meetup', 'meetme', 'meetirl', 'irlmeet',
  'yourlocation', 'urlocation', 'homealone', 'yourparents', 'urparents', 'donttellyourparents', 'donttellurparents', 'ourlittlesecret',
  'keepasecret', 'yourbirthday', 'urbirthday',
];
/** Short ones only count as whole words. */
const PERSONAL_TOKENS = ['asl', 'urage', 'selfie', 'selfies', 'pics', 'age'];

const NUMBER_WORDS = new Set(['zero', 'oh', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'won', 'to', 'too', 'for', 'ate']);

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|me|tv|co|app|xyz|ly|us|uk|ca|de|fr|au|info|biz|link|site|online|shop|live)\b|\b[a-z0-9-]{2,}\s*(\.|\(dot\)|\[dot\]|\bdot\b)\s*(com|net|org|info|biz|xyz|online|site|shop)\b)/i;
const EMAIL_RE = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}/i;
const HANDLE_RE = /(^|\s)@[a-z0-9_.]{3,}/i;
const ADDRESS_RE = /\b\d{1,5}\s+[a-z]+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|blvd|way|place|pl)\b/i;

function hasPhoneLike(text: string): boolean {
  // Five or more digits, even spread out ("5 5 5-12 3").
  const digits = (text.match(/\d/g) ?? []).length;
  if (digits >= 5) return true;
  // Spelled-out digit sequences ("five five five one two").
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let run = 0;
  for (const w of words) {
    if (NUMBER_WORDS.has(w) || /^\d$/.test(w)) {
      run++;
      if (run >= 4) return true;
    } else run = 0;
  }
  return false;
}

function tokenHits(token: string, words: string[], prefixes: string[]): boolean {
  if (!token) return false;
  if (words.includes(token)) return true;
  return prefixes.some((p) => token.startsWith(p));
}

/** Clean and check one message. */
export function filterChat(input: string): FilterResult {
  // Normalise: compatibility forms (fullwidth letters etc.), strip invisible characters.
  let text = String(input ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { ok: false, text: '', reason: 'empty' };
  if (text.length > MAX_CHAT_LENGTH) return { ok: false, text: '', reason: 'too_long' };
  if (NON_LATIN_LETTER.test(text) || NON_ASCII_DIGIT.test(text)) return { ok: false, text: '', reason: 'unsupported' };

  if (EMAIL_RE.test(text)) return { ok: false, text: '', reason: 'personal_info' };
  if (URL_RE.test(text)) return { ok: false, text: '', reason: 'link' };
  if (HANDLE_RE.test(text)) return { ok: false, text: '', reason: 'off_platform' };
  if (ADDRESS_RE.test(text) || hasPhoneLike(text)) return { ok: false, text: '', reason: 'personal_info' };

  const rawTokens = text.split(' ');
  const tokens = rawTokens.map((t) => unstretch(squash(t)));
  // Whole message squashed (catches "f u c k", "k y s", "how old r u").
  const joined = unstretch(squash(text));
  // Runs of single letters joined ("s n a p").
  const singles: string[] = [];
  let run = '';
  for (const t of rawTokens) {
    const q = squash(t);
    if (q.length === 1) run += q;
    else {
      if (run.length >= 3) singles.push(run);
      run = '';
    }
  }
  if (run.length >= 3) singles.push(run);

  if (SEVERE_PHRASES.some((p) => joined.includes(p))) return { ok: false, text: '', reason: 'blocked_word' };
  if (tokens.some((t) => tokenHits(t, SEVERE_WORDS, SEVERE_PREFIXES)) || singles.some((t) => tokenHits(t, SEVERE_WORDS, SEVERE_PREFIXES))) {
    return { ok: false, text: '', reason: 'blocked_word' };
  }
  if (PERSONAL_QUESTIONS.some((p) => joined.includes(p)) || tokens.some((t) => PERSONAL_TOKENS.includes(t))) return { ok: false, text: '', reason: 'personal_question' };
  if (OFF_PLATFORM_PHRASES.some((p) => joined.includes(p))) return { ok: false, text: '', reason: 'off_platform' };
  if (tokens.some((t) => OFF_PLATFORM.includes(t)) || singles.some((t) => OFF_PLATFORM.includes(t))) return { ok: false, text: '', reason: 'off_platform' };
  if (singles.some((t) => tokenHits(t, MILD_WORDS, MILD_PREFIXES))) return { ok: false, text: '', reason: 'blocked_word' };

  // Mask everyday swearing word by word.
  const masked = rawTokens.map((raw, i) => (tokenHits(tokens[i], MILD_WORDS, MILD_PREFIXES) ? '*'.repeat(Math.max(3, raw.length)) : raw));
  text = masked.join(' ');
  // SHOUTING → normal case; stretched letters trimmed.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) text = text.toLowerCase();
  text = text.replace(/(.)\1{4,}/g, '$1$1$1');
  if (!text.replace(/[*\s]/g, '')) return { ok: false, text: '', reason: 'blocked_word' };
  return { ok: true, text };
}
