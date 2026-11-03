// Unit tests for shared question scoring/processing.
// Run: node server/questionUtils.test.mjs
import { isAnswerCorrect, deduplicate, processQuestions } from './questionUtils.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', name); }
}

// ----- MCQ: unchanged strict letter match -----
const mcq = { type: 'mcq', question: 'x', options: ['a','b','c','d'], answer: 'b' };
check('mcq correct letter', isAnswerCorrect(mcq, 'b') === true);
check('mcq correct letter uppercase', isAnswerCorrect(mcq, 'B') === true);
check('mcq wrong letter', isAnswerCorrect(mcq, 'a') === false);
check('mcq empty', isAnswerCorrect(mcq, '') === false);
check('mcq undefined', isAnswerCorrect(mcq, undefined) === false);

// ----- TF -----
const tfTrue = { type: 'tf', question: 'x', options: ['True','False'], answer: 'true' };
check('tf true', isAnswerCorrect(tfTrue, 'true') === true);
check('tf True cased', isAnswerCorrect(tfTrue, 'True') === true);
check('tf t short', isAnswerCorrect(tfTrue, 't') === true);
check('tf yes', isAnswerCorrect(tfTrue, 'yes') === true);
check('tf wrong', isAnswerCorrect(tfTrue, 'false') === false);
check('tf empty', isAnswerCorrect(tfTrue, '') === false);

// ----- FITB: forgiving but no false positives -----
const fitb = (ans) => ({ type: 'fitb', question: 'x _____ y', answer: ans });

// accepted variations
check('fitb exact', isAnswerCorrect(fitb('feedwater'), 'feedwater') === true);
check('fitb case', isAnswerCorrect(fitb('Feedwater'), 'feedwater') === true);
check('fitb spacing', isAnswerCorrect(fitb('feedwater'), 'feed water') === true);
check('fitb hyphen', isAnswerCorrect(fitb('feedwater'), 'feed-water') === true);
check('fitb leading article', isAnswerCorrect(fitb('desalter'), 'the desalter') === true);
check('fitb article both', isAnswerCorrect(fitb('a reboiler'), 'reboiler') === true);
check('fitb trailing period', isAnswerCorrect(fitb('reflux'), 'reflux.') === true);
check('fitb surrounding spaces', isAnswerCorrect(fitb('coke drum'), '  coke drum  ') === true);
check('fitb quotes', isAnswerCorrect(fitb('naphtha'), '"naphtha"') === true);

// rejected: genuinely different answers must stay wrong
check('fitb different word', isAnswerCorrect(fitb('gate valve'), 'globe valve') === false);
check('fitb partial not accepted', isAnswerCorrect(fitb('relief valve'), 'valve') === false);
check('fitb superset not accepted', isAnswerCorrect(fitb('centrifugal'), 'centrifugal pump') === false);
check('fitb empty user', isAnswerCorrect(fitb('reflux'), '') === false);
check('fitb empty key', isAnswerCorrect(fitb(''), 'reflux') === false);
check('fitb wrong number', isAnswerCorrect(fitb('150'), '250') === false);

// ----- dedup with excludeTexts (used by fallback multi path) -----
const batch = [
  { type:'mcq', question:'What is the function of the FD fan?', options:['a','b','c','d'], answer:'a' },
  { type:'mcq', question:'What is the function of the ID fan?', options:['a','b','c','d'], answer:'a' },
  { type:'mcq', question:'Describe the purpose of the desalter.', options:['a','b','c','d'], answer:'a' },
];
const excl = ['What is the function of the FD fan?'];
const deduped = deduplicate(batch, excl);
check('dedup removes seen FD fan', !deduped.some(q => q.question.includes('FD fan')));
check('dedup keeps distinct ID fan', deduped.some(q => q.question.includes('ID fan')));
check('dedup keeps unrelated desalter', deduped.some(q => q.question.includes('desalter')));

// ----- processQuestions still rejects invalid answers -----
const withBad = [
  { type:'mcq', question:'ok', options:['a','b','c','d'], answer:'a' },
  { type:'mcq', question:'bad answer letter', options:['a','b','c','d'], answer:'z' },
  { type:'fitb', question:'no answer', answer:'' },
];
const processed = processQuestions(withBad, []);
check('processQuestions drops out-of-range mcq and empty fitb', processed.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
