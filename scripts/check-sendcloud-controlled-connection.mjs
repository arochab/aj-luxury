import { checkSendcloudControlledConnection } from
  "../lib/commerce/sendcloud-connection-check.ts";

const checked = await checkSendcloudControlledConnection({
  publicKey: process.env.SENDCLOUD_PUBLIC_KEY,
  secretKey: process.env.SENDCLOUD_SECRET_KEY,
}, {
  countryCode: "FR",
  postalCode: process.env.SENDCLOUD_CHECK_POSTAL_CODE ?? "75001",
  city: process.env.SENDCLOUD_CHECK_CITY ?? "Paris",
  dutiesTerms: "EU_INCLUDED",
});

process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
if (checked.reason !== "ready" || !checked.homeDeliveryReady) process.exitCode = 1;
