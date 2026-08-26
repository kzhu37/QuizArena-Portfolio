(function bootstrapAnswerMatcher(ns) {
  function singularize(value) {
    if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
    if (value.endsWith("ses")) return value.slice(0, -2);
    if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
    return value;
  }

  class AnswerMatcher {
    normalize(value) {
      return ns.normalizeAnswer(value);
    }

    expandAccepted(record) {
      const accepted = new Set();
      const raw = [
        record?.canonicalResponse,
        ...(Array.isArray(record?.acceptedResponses) ? record.acceptedResponses : [])
      ];
      for (const item of raw) {
        const normalized = this.normalize(item);
        if (!normalized) continue;
        accepted.add(normalized);
        accepted.add(singularize(normalized));
      }
      return accepted;
    }

    match(response, record) {
      const normalized = this.normalize(response);
      if (!normalized) {
        return {
          matched: false,
          normalizedResponse: "",
          normalizedAccepted: []
        };
      }

      const accepted = [...this.expandAccepted(record)];
      const responseVariants = new Set([
        normalized,
        singularize(normalized)
      ]);

      let matched = false;
      for (const candidate of accepted) {
        if (responseVariants.has(candidate)) {
          matched = true;
          break;
        }
        for (const variant of responseVariants) {
          if (variant.length >= 6 && (candidate.includes(variant) || variant.includes(candidate))) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      return {
        matched,
        normalizedResponse: normalized,
        normalizedAccepted: accepted
      };
    }
  }

  ns.AnswerMatcher = AnswerMatcher;
})(window.Jeopardy = window.Jeopardy || {});
