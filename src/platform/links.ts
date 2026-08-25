import { FLAGSHIP_BOARD_MODE_NAME, FLAGSHIP_BOARD_MODE_ROUTE } from "./product";

function buildLegacyQuery() {
  const params = new URLSearchParams({
    boardName: FLAGSHIP_BOARD_MODE_NAME,
    hubHash: "#/",
    flagshipHash: `#${FLAGSHIP_BOARD_MODE_ROUTE}`
  });

  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
    : "";
  const shellParams = new URLSearchParams(hashQuery);
  if (shellParams.get("portfolioCapture") === "1") {
    params.set("portfolioCapture", "1");
  }

  return `?${params.toString()}`;
}

export function getLegacyJeopardyUrl() {
  const query = buildLegacyQuery();
  return `./legacy/jeopardy-gameNewQuestionsV3.html${query}`;
}

export function getHubHashUrl() {
  if (window.location.protocol === "file:") {
    return null;
  }
  return "./#/";
}
