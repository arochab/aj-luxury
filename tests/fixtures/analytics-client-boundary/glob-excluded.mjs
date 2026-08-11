export default import.meta.glob(
  [
    "../../../lib/analytics/**/*.ts",
    "!../../../lib/analytics/server*.ts",
  ],
  { eager: true, query: "?raw", import: "default" },
);
