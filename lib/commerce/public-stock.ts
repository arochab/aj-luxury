import type { ProductSize } from "../products.ts";

export type PublicStockStatus =
  | { state: "available" }
  | { state: "low-stock"; remaining: number }
  | { state: "sold-out" };

export type PublicStockBySize = Record<ProductSize, PublicStockStatus>;
