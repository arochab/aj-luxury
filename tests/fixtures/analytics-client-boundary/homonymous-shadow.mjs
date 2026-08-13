const target = "client-safe";

function deadServerScope() {
  const target = "../../../lib/analytics/server-events.ts";
  return import(target);
}

void deadServerScope;
export default target;
