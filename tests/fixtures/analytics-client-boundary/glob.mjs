export default import.meta.glob(
  "../../../lib/analytics/**/*.ts",
  { eager: true, query: "?raw", import: "default" },
);
