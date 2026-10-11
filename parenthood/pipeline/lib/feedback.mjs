// One-tap feedback from the nightly email: "More like this" / "Less like this" open a reply to the digest address
// with a fixed subject. The inbox recognises that subject and stores a vote (plus any comment they add) instead of
// a regular note; the planner and the writer use the votes.

const HINT = {
  en: '(Optional) What did you like or not? Sending it as is also counts.',
  ko: '(선택) 좋았던 점이나 아쉬운 점을 적어 주셔도 됩니다. 그대로 보내셔도 반영됩니다.',
};

/** mailto: link for a vote on a given day. */
export function feedbackLink(replyTo, day, vote, lang) {
  const subject = `Feedback Day ${day}: ${vote > 0 ? 'more' : 'less'} like this`;
  return `mailto:${replyTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${HINT[lang] || HINT.en}\n\n`)}`;
}

/** { day, vote, comment } if this email is a feedback vote, else null. */
export function parseFeedback(subject = '', text = '') {
  const m = String(subject).match(/feedback\s+day\s+(\d+)\s*:\s*(more|less)\b/i);
  if (!m) return null;
  const hints = Object.values(HINT);
  const comment = String(text).split('\n').filter((l) => !hints.includes(l.trim())).join('\n').trim();
  return { day: Number(m[1]), vote: m[2].toLowerCase() === 'more' ? 1 : -1, comment: comment.slice(0, 1000) };
}
