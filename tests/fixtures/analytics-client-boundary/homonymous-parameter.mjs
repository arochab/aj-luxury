const target = "../../../lib/analytics/server-events.ts";
void target;

function clientOnly(target) {
  if (false) return import(target);
  return target;
}

export default clientOnly("client-safe");
