// Per-participant question shuffling for Custom Quiz sessions.
//
// WHY DETERMINISTIC RATHER THAN RANDOM-AND-STORED
// ---------------------------------------------------------------------------
// Scoring matches answers to questions POSITIONALLY (answers[i] against
// questions[i]). So if each participant sees a different order, the server
// must be able to reconstruct that exact same order at submit time, or every
// score is garbage.
//
// Two ways to do that: store each participant's shuffled order in the database
// (needs a migration, extra storage, and a write on join), or derive it
// deterministically from something we already have. We do the latter, seeding
// the shuffle with the participant's own row id. Same participant always gets
// the same layout — including if they refresh the page and rejoin before
// submitting — and nothing extra is stored anywhere.

// mulberry32: small, fast, well-distributed seeded PRNG. Math.random() can't
// be used here because it isn't seedable, so it couldn't be reproduced at
// scoring time.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(rand, array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function letterToIndex(answer) {
  if (answer === undefined || answer === null) return null;
  const a = answer.toString().toLowerCase().trim();
  if (!/^[a-z]$/.test(a)) return null;
  return a.charCodeAt(0) - 97;
}

/**
 * Builds one participant's personal view of a session's questions.
 *
 * Given the same (questions, participantId) pair this ALWAYS returns an
 * identical result, which is what makes scoring possible without storing
 * anything. Both the join handler and the submit handler call this.
 *
 * Returns questions with:
 *   - order shuffled
 *   - multiple-choice options shuffled, with `answer` remapped to wherever
 *     the correct option landed
 *
 * True/false questions are deliberately NOT option-shuffled: the answer is
 * the literal string "true"/"false" rather than a position, and the frontend
 * renders the labels in order, so swapping them would desynchronise the two.
 * Fill-in-the-blank has no options to shuffle.
 */
export function buildParticipantView(questions, participantId) {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const seed = Number(participantId) || 1;
  const rand = seededRandom(seed);

  // Question order first.
  const ordered = shuffleWith(rand, questions);

  // Then options within each MCQ. Draws from the same PRNG stream, so the
  // whole layout stays reproducible as one unit.
  return ordered.map(q => {
    if (q.type !== 'mcq' || !Array.isArray(q.options) || q.options.length < 2) return { ...q };

    const answerIdx = letterToIndex(q.answer);
    if (answerIdx === null || answerIdx >= q.options.length) return { ...q };

    const paired = q.options.map((opt, i) => ({ opt, correct: i === answerIdx }));
    const shuffled = shuffleWith(rand, paired);
    const newAnswerIdx = shuffled.findIndex(p => p.correct);

    return {
      ...q,
      options: shuffled.map(p => p.opt),
      answer: String.fromCharCode(97 + newAnswerIdx),
    };
  });
}

/** Strips answer keys before sending a view to the participant's browser. */
export function stripAnswers(view) {
  return view.map(({ answer, explanation, ...rest }) => rest);
}
