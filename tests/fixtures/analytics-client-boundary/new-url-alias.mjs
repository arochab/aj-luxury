const AssetUrl = URL;
const target = "../../../lib/analytics/server-events.ts";

export default new AssetUrl(target, import.meta.url).href;
