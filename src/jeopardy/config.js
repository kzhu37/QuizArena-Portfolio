(function bootstrapConfig(ns) {
  ns.ROUND_VALUES = {
    r1: [200, 400, 600, 800, 1000],
    r2: [400, 800, 1200, 1600, 2000]
  };

  ns.ROUND_LABELS = {
    r1: "Round One",
    r2: "Double Round",
    final: "Final Clue"
  };

  ns.LOCAL_RUNTIME_VERSION = "jeopardy-local-runtime-v2";
  ns.LOCAL_STATE_KEY = "jeopardy_local_runtime_state_v2";
  ns.LOCAL_USAGE_KEY = "jeopardy_local_runtime_usage_v2";

  ns.LEGACY_STATE_KEYS = [
    "jeopardy_local_runtime_state_v1",
    "turn_based_jeopardy_v6",
    "turn_based_jeopardy_v7"
  ];

  ns.MAX_GAME_ASSEMBLY_ATTEMPTS = 48;
  ns.MAX_ROUND_ASSEMBLY_ATTEMPTS = 36;
  ns.MAX_CATEGORY_SEARCH_WIDTH = 30;
  ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD = 2;
  ns.MIN_CLUES_PER_VALUE = 8;
  ns.MIN_REGULAR_CATEGORIES = 70;
  ns.MIN_ROUND_CATEGORIES = 35;
  ns.MIN_REGULAR_BANK_CLUES = 8022;
  ns.MIN_ROUND1_BANK_CLUES = 3240;
  ns.MIN_ROUND2_BANK_CLUES = 2644;
  ns.RECENT_BOARD_TITLE_HASH_WINDOW = 18;
  ns.RECENT_BOARD_FAMILY_HASH_WINDOW = 24;

  ns.MACRO_FAMILIES = [
    "stem",
    "history_civics",
    "geography",
    "literature_language",
    "arts_music",
    "sports",
    "mythology_ancient",
    "film_television",
    "general"
  ];

  ns.FAMILY_WEIGHTS = {
    stem: 1.08,
    history_civics: 1.06,
    geography: 1.04,
    literature_language: 0.58,
    arts_music: 0.55,
    sports: 0.99,
    mythology_ancient: 1.03,
    film_television: 0.99,
    general: 1.0
  };

  ns.FINAL_FAMILY_WEIGHTS = {
    stem: 1.08,
    history_civics: 1.06,
    geography: 1.04,
    literature_language: 0.58,
    arts_music: 0.55,
    sports: 0.98,
    mythology_ancient: 1.03,
    film_television: 0.99,
    general: 1.0
  };

  ns.DIFFICULTY_BANDS = {
    r1: {
      200: [15, 25],
      400: [26, 40],
      600: [41, 55],
      800: [56, 72],
      1000: [73, 88]
    },
    r2: {
      400: [30, 45],
      800: [46, 58],
      1200: [59, 70],
      1600: [71, 84],
      2000: [85, 97]
    },
    final: [75, 95]
  };

  ns.DIFFICULTY_MODE_BIAS = {
    tv: 0.82
  };

  ns.CATEGORY_TITLE_BLACKLIST_RE = /(workshop|deep cuts|potpourri|by the figures|lab\b|field notes|spotlight|handbook|math words|on the map|words to the wise|by the numbers)/i;
  ns.CATEGORY_TITLE_LAZY_NUMBER_RE = /\s(?:\d+|part\s+(?:i{1,3}|iv|v)|round\s+\d+|category\s+\d+)$/i;
  ns.CATEGORY_TITLE_BANNED_RE = /\b(iso|i\.?s\.?o\.?|iatas?|abbreviations?|codes?|two-letter country codes?|language codes?|currency codes?|script codes?|airport codes?|airport cities?|world airports?|time zones?|cities by time zone|constellation abbreviations?|element symbols?|atomic numbers?|periodic table names?|measuring units?|measurement units?)\b/i;
  ns.CLUE_BANNED_TEMPLATE_RE = /\b(iso alpha-?2|iata code|language code|currency code|script code|code phrase|country code|airport code|time zone|unit identifier|chemical-symbol phrase|atomic-number phrase|constellation abbreviation)\b/i;
  ns.CLUE_LOW_INFORMATION_RE = /\b(is the answer|title sought here|this is described as|scientific article|journal article|U\.S\. patent|National Archives and Records Administration's holdings|known as an automobile model|this automaker produced|this manufacturer built)\b/i;
  ns.UNRESOLVED_IDENTIFIER_RE = /\b[QP]\d{3,}\b/u;
  ns.JEOPARDY_RESPONSE_RE = /^(What|Who|Where|When)\s+(?:is|are|was|were)\s+.+\?$/u;
  ns.CATEGORY_TITLE_COMPUTE_RE = /(number theory|integer interest|odds and ends|by the numbers|mental math|arithmetic|algebra|calculated|sums and differences|product placement|equation station|last digit|range finder|prime time|percent perfect|square deal|cube club|calculator)/i;
  ns.CLUE_PREFIX_BLACKLIST_RE = /^(to warm up|in one term|a standard definition|more technical|now we're deeper|experts call this|be specific|in formal language|a textbook would say|in technical language|for specialists|for the specialists|at a higher level|a more exact description|in basic science|a common definition|identify this term|name it|give the term for|more precisely|define this|scientists might describe|in context|in a bit more detail|in the literature|in formal terms|in expert jargon|at the highest level|a tight, technical definition|a grad-?level description|in advanced context|a precise description|as defined in textbooks|a more exact statement|in rigorous terms|this describes)\s*[:,]?\s*/i;
  ns.CLUE_RESIDUAL_BLACKLIST_RE = /(-\s*(name the term|identify it|what is it called|give the precise term|give the technical term)[.?]?\s*$|\b(give the precise term|give the technical term)[.?]?\s*$)/i;
  ns.TEXT_JUNK_RE = /(â€”|â€œ|â€|â‚¬Å“|â‚¬Â|â‚¬Â™|��|\bundefined\b|\bnull\b)/i;
  ns.COMPUTE_CONTENT_RE = /(solve for|calculate|how many remain|what is [0-9]|sum of|product of|difference between|percent of|square root|cube root|factorial|long division|arithmetic progression)/i;

  ns.FINAL_STAGE = {
    CHOOSE: "chooseCategory",
    WAGERS: "wagers",
    CLUE: "clue",
    ANSWERS: "answers",
    JUDGE: "judge",
    DONE: "done"
  };
})(window.Jeopardy = window.Jeopardy || {});
