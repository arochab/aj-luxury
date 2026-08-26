const entryName = globalThis.__ANALYTICS_SERVER_ENTRY__ ?? "server";

export default import(`../../../lib/analytics/${entryName}.ts`);
