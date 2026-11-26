/**
 * Canonical repository and package details for the open-source project.
 *
 * Every UI surface that links to the source (landing page, guide, workspace
 * header, footer) reads from here, so the repository name, licence, npm
 * package, and issue links only ever change in one place.
 */

const OWNER = "ramaeondev";
const NAME = "md.therama.dev";
const BASE = `https://github.com/${OWNER}/${NAME}`;

export const REPOSITORY = {
  owner: OWNER,
  name: NAME,
  slug: `${OWNER}/${NAME}`,
  url: BASE,
  issuesUrl: `${BASE}/issues`,
  license: "MIT",
  licenseUrl: `${BASE}/blob/main/LICENSE`,
  cloneCommand: `git clone ${BASE}.git`,
} as const;

/**
 * The MCP server ships as its own npm package, published from this repository's
 * `mcp/` directory. Linked from the "MCP Compatible" claim in the UI.
 */
export const MCP_PACKAGE = {
  name: "@ramaeon/md-workspace-mcp",
  version: "0.1.1",
  url: "https://www.npmjs.com/package/@ramaeon/md-workspace-mcp",
  sourceUrl: `${BASE}/tree/main/mcp`,
  installCommand: "npx -y @ramaeon/md-workspace-mcp",
} as const;
