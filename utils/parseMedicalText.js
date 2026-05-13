/**
 * Lightweight parser: extract diagnoses, prescriptions, allergies from OCR text.
 * Keyword/regex only; no ML. Returns structured object for backend.
 * @param {string} text - Raw OCR text
 * @returns {{ diagnoses: string[], prescriptions: string[], allergies: string[] }}
 */
function parseMedicalText(text) {
  const result = {
    diagnoses: [],
    prescriptions: [],
    allergies: [],
  };
  if (!text || typeof text !== 'string') return result;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const diagnosisKeywords = [
    /^diagnosis\s*:?\s*/i,
    /^dx\s*:?\s*/i,
    /^assessment\s*:?\s*/i,
    /^impression\s*:?\s*/i,
    /^condition\s*:?\s*/i,
    /^diagnoses\s*:?\s*/i,
  ];
  const prescriptionKeywords = [
    /^prescription\s*:?\s*/i,
    /^medication\s*:?\s*/i,
    /^medications\s*:?\s*/i,
    /^rx\s*:?\s*/i,
    /^drugs?\s*:?\s*/i,
    /^treatment\s*:?\s*/i,
    /^tablet\s*:?\s*/i,
    /^capsule\s*:?\s*/i,
    /^dose\s*:?\s*/i,
  ];
  const allergyKeywords = [
    /^allerg(y|ies)\s*:?\s*/i,
    /^allergic\s+to\s*:?\s*/i,
    /^nka\s*:?\s*/i,
    /^nkda\s*:?\s*/i,
    /^no\s+known\s+allergies\s*:?\s*/i,
    /^hypersensitivity\s*:?\s*/i,
  ];

  function extractSection(keywords, lineList) {
    const items = new Set();
    let inSection = false;
    let currentLine = '';
    for (const line of lineList) {
      const lower = line.toLowerCase();
      const matched = keywords.some((k) => (typeof k === 'string' ? lower.startsWith(k) : k.test(line)));

      if (matched) {
        inSection = true;
        currentLine = line.replace(/^[^:]+:?\s*/i, '').trim();
        if (currentLine) {
          currentLine.split(/[,;]|\band\b/).forEach((s) => {
            const t = s.trim();
            if (t && t.length > 1) items.add(t);
          });
        }
        continue;
      }
      if (inSection) {
        if (line.match(/^\s*$/) || line.match(/^[a-z]+\s*:?\s*/i)) {
          inSection = false;
        } else {
          line.split(/[,;]|\band\b/).forEach((s) => {
            const t = s.trim();
            if (t && t.length > 1) items.add(t);
          });
        }
      }
    }
    return Array.from(items);
  }

  result.diagnoses = extractSection(diagnosisKeywords, lines);
  result.prescriptions = extractSection(prescriptionKeywords, lines);
  result.allergies = extractSection(allergyKeywords, lines);

  // Fallback: if no structured sections, try line-based heuristics
  if (result.diagnoses.length === 0 && result.prescriptions.length === 0 && result.allergies.length === 0) {
    for (const line of lines) {
      if (line.length < 3) continue;
      if (/\b(diagnosis|dx|condition)\b/i.test(line))
        result.diagnoses.push(line.replace(/^[^:]+:?\s*/i, '').trim());
      if (/\b(medication|prescription|rx|tablet|capsule|mg|ml)\b/i.test(line))
        result.prescriptions.push(line.trim());
      if (/\b(allerg|nka|nkda|allergic to)\b/i.test(line))
        result.allergies.push(line.replace(/^[^:]+:?\s*/i, '').trim());
    }
  }

  result.diagnoses = result.diagnoses.filter((s) => s.length > 0 && s.length < 500);
  result.prescriptions = result.prescriptions.filter((s) => s.length > 0 && s.length < 500);
  result.allergies = result.allergies.filter((s) => s.length > 0 && s.length < 500);

  return result;
}

module.exports = { parseMedicalText };
