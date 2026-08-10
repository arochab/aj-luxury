import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const utcNow = sql`CURRENT_TIMESTAMP`;

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_products_slug").on(table.slug),
    check("ck_products_price_non_negative", sql`${table.priceCents} >= 0`),
    check("ck_products_currency_eur", sql`${table.currency} = 'EUR'`),
    check(
      "ck_products_status",
      sql`${table.status} IN ('draft', 'active', 'archived')`,
    ),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    acceptsMarketing: integer("accepts_marketing", { mode: "boolean" })
      .notNull()
      .default(false),
    marketingConsentAt: text("marketing_consent_at"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
    deletedAt: text("deleted_at"),
  },
  (table) => [uniqueIndex("ux_customers_email").on(table.email)],
);

export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    internalReference: text("internal_reference").notNull(),
    colorKey: text("color_key").notNull(),
    colorName: text("color_name").notNull(),
    size: text("size", { enum: ["S", "M", "L", "XL"] }).notNull(),
    swatch: text("swatch").notNull(),
    imageUrl: text("image_url").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_variants_internal_reference").on(table.internalReference),
    uniqueIndex("ux_variants_product_color_size").on(
      table.productId,
      table.colorKey,
      table.size,
    ),
    index("idx_variants_product_active").on(table.productId, table.active),
    check("ck_variants_size", sql`${table.size} IN ('S', 'M', 'L', 'XL')`),
    check("ck_variants_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const inventory = sqliteTable(
  "inventory",
  {
    variantId: text("variant_id")
      .primaryKey()
      .references(() => variants.id, { onDelete: "restrict" }),
    physicalQuantity: integer("physical_quantity").notNull(),
    giftReserveQuantity: integer("gift_reserve_quantity").notNull().default(0),
    safetyReserveQuantity: integer("safety_reserve_quantity")
      .notNull()
      .default(0),
    activeReservedQuantity: integer("active_reserved_quantity")
      .notNull()
      .default(0),
    soldQuantity: integer("sold_quantity").notNull().default(0),
    reservesValidated: integer("reserves_validated", { mode: "boolean" })
      .notNull()
      .default(false),
    version: integer("version").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    check(
      "ck_inventory_quantities_non_negative",
      sql`${table.physicalQuantity} >= 0
        AND ${table.giftReserveQuantity} >= 0
        AND ${table.safetyReserveQuantity} >= 0
        AND ${table.activeReservedQuantity} >= 0
        AND ${table.soldQuantity} >= 0`,
    ),
    check(
      "ck_inventory_allocation_within_physical",
      sql`${table.giftReserveQuantity}
        + ${table.safetyReserveQuantity}
        + ${table.activeReservedQuantity}
        + ${table.soldQuantity}
        <= ${table.physicalQuantity}`,
    ),
  ],
);

export const carts = sqliteTable(
  "carts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["open", "converted", "expired"] })
      .notNull()
      .default("open"),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    email: text("email"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    index("idx_carts_customer_status").on(table.customerId, table.status),
    index("idx_carts_status_expires_at").on(table.status, table.expiresAt),
    check("ck_carts_status", sql`${table.status} IN ('open', 'converted', 'expired')`),
    check("ck_carts_currency_eur", sql`${table.currency} = 'EUR'`),
  ],
);

export const cartLines = sqliteTable(
  "cart_lines",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_cart_lines_cart_variant").on(table.cartId, table.variantId),
    index("idx_cart_lines_cart_id").on(table.cartId),
    check("ck_cart_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("ck_cart_lines_price_non_negative", sql`${table.unitPriceCents} >= 0`),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    cartId: text("cart_id").references(() => carts.id, { onDelete: "set null" }),
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    status: text("status", {
      enum: [
        "pending_payment",
        "paid",
        "preparing",
        "shipped",
        "cancelled",
        "refunded",
      ],
    })
      .notNull()
      .default("pending_payment"),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    shippingCountryCode: text("shipping_country_code").notNull(),
    shippingAddressJson: text("shipping_address_json").notNull(),
    billingAddressJson: text("billing_address_json").notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_orders_order_number").on(table.orderNumber),
    uniqueIndex("ux_orders_cart_id").on(table.cartId),
    index("idx_orders_customer_created_at").on(table.customerId, table.createdAt),
    index("idx_orders_status_created_at").on(table.status, table.createdAt),
    check(
      "ck_orders_status",
      sql`${table.status} IN (
        'pending_payment', 'paid', 'preparing', 'shipped', 'cancelled', 'refunded'
      )`,
    ),
    check("ck_orders_currency_eur", sql`${table.currency} = 'EUR'`),
    check(
      "ck_orders_amounts_non_negative",
      sql`${table.subtotalCents} >= 0
        AND ${table.shippingCents} >= 0
        AND ${table.taxCents} >= 0
        AND ${table.totalCents} >= 0`,
    ),
    check(
      "ck_orders_total_consistent",
      sql`${table.totalCents} = ${table.subtotalCents} + ${table.shippingCents} + ${table.taxCents}`,
    ),
  ],
);

export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: text("variant_id").references(() => variants.id, {
      onDelete: "set null",
    }),
    internalReference: text("internal_reference").notNull(),
    productName: text("product_name").notNull(),
    colorName: text("color_name").notNull(),
    size: text("size", { enum: ["S", "M", "L", "XL"] }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [
    index("idx_order_lines_order_id").on(table.orderId),
    check("ck_order_lines_size", sql`${table.size} IN ('S', 'M', 'L', 'XL')`),
    check("ck_order_lines_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "ck_order_lines_amounts_consistent",
      sql`${table.unitPriceCents} >= 0
        AND ${table.lineTotalCents} = ${table.unitPriceCents} * ${table.quantity}`,
    ),
  ],
);

export const stockReservations = sqliteTable(
  "stock_reservations",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    status: text("status", {
      enum: ["active", "released", "converted", "expired"],
    })
      .notNull()
      .default("active"),
    idempotencyKey: text("idempotency_key").notNull(),
    lastTransitionKey: text("last_transition_key"),
    expiresAt: text("expires_at").notNull(),
    convertedOrderId: text("converted_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_stock_reservations_idempotency_key").on(
      table.idempotencyKey,
    ),
    index("idx_stock_reservations_transition_key").on(
      table.lastTransitionKey,
    ),
    index("idx_stock_reservations_cart_status").on(table.cartId, table.status),
    index("idx_stock_reservations_status_expires_at").on(
      table.status,
      table.expiresAt,
    ),
    check("ck_stock_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "ck_stock_reservations_status",
      sql`${table.status} IN ('active', 'released', 'converted', 'expired')`,
    ),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider", { enum: ["test", "stripe"] }).notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    status: text("status", {
      enum: [
        "created",
        "requires_action",
        "succeeded",
        "failed",
        "expired",
        "refunded",
      ],
    })
      .notNull()
      .default("created"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    idempotencyKey: text("idempotency_key").notNull(),
    failureCode: text("failure_code"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_payments_provider_session").on(
      table.provider,
      table.providerSessionId,
    ),
    uniqueIndex("ux_payments_idempotency_key").on(table.idempotencyKey),
    uniqueIndex("ux_payments_order_succeeded")
      .on(table.orderId)
      .where(sql`${table.status} = 'succeeded'`),
    index("idx_payments_order_id").on(table.orderId),
    check("ck_payments_provider", sql`${table.provider} IN ('test', 'stripe')`),
    check(
      "ck_payments_status",
      sql`${table.status} IN (
        'created', 'requires_action', 'succeeded', 'failed', 'expired', 'refunded'
      )`,
    ),
    check("ck_payments_amount_non_negative", sql`${table.amountCents} >= 0`),
    check("ck_payments_currency_eur", sql`${table.currency} = 'EUR'`),
  ],
);

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: ["test", "stripe"] }).notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    verificationMethod: text("verification_method", {
      enum: ["test_adapter", "stripe_signature"],
    }).notNull(),
    verifiedAt: text("verified_at").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    providerPaymentId: text("provider_payment_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull(),
    status: text("status", { enum: ["verified", "processed", "failed"] })
      .notNull()
      .default("verified"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    receivedAt: text("received_at").notNull().default(utcNow),
    processedAt: text("processed_at"),
  },
  (table) => [
    uniqueIndex("ux_webhook_events_provider_event").on(
      table.provider,
      table.providerEventId,
    ),
    index("idx_webhook_events_status_received_at").on(
      table.status,
      table.receivedAt,
    ),
    check("ck_webhook_events_provider", sql`${table.provider} IN ('test', 'stripe')`),
    check(
      "ck_webhook_events_verification_method",
      sql`${table.verificationMethod} IN ('test_adapter', 'stripe_signature')`,
    ),
    check(
      "ck_webhook_events_status",
      sql`${table.status} IN ('verified', 'processed', 'failed')`,
    ),
    check("ck_webhook_events_attempts_non_negative", sql`${table.attempts} >= 0`),
    check("ck_webhook_events_amount_positive", sql`${table.amountCents} > 0`),
    check("ck_webhook_events_currency_eur", sql`${table.currency} = 'EUR'`),
  ],
);

export const customerSessions = sqliteTable(
  "customer_sessions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_customer_sessions_token_hash").on(table.tokenHash),
    index("idx_customer_sessions_customer_expires_at").on(
      table.customerId,
      table.expiresAt,
    ),
  ],
);

export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    kind: text("kind", {
      enum: [
        "magic_link",
        "order_confirmation",
        "payment_failed",
        "shipment_confirmation",
        "refund_confirmation",
      ],
    }).notNull(),
    recipientEmail: text("recipient_email").notNull(),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    locale: text("locale").notNull().default("fr"),
    templateVersion: text("template_version").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status", { enum: ["pending", "sending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull().default(utcNow),
    lastErrorCode: text("last_error_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex("ux_email_outbox_idempotency_key").on(table.idempotencyKey),
    index("idx_email_outbox_status_next_attempt").on(
      table.status,
      table.nextAttemptAt,
    ),
    check(
      "ck_email_outbox_kind",
      sql`${table.kind} IN (
        'magic_link', 'order_confirmation', 'payment_failed',
        'shipment_confirmation', 'refund_confirmation'
      )`,
    ),
    check(
      "ck_email_outbox_status",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed')`,
    ),
    check("ck_email_outbox_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    kind: text("kind", {
      enum: [
        "seed",
        "reserve",
        "release",
        "sale",
        "gift_allocation",
        "safety_allocation",
        "adjustment",
      ],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    actorType: text("actor_type", { enum: ["system", "customer", "admin"] })
      .notNull()
      .default("system"),
    actorId: text("actor_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("ux_inventory_movements_idempotency_key").on(
      table.idempotencyKey,
    ),
    index("idx_inventory_movements_variant_created_at").on(
      table.variantId,
      table.createdAt,
    ),
    check(
      "ck_inventory_movements_kind",
      sql`${table.kind} IN (
        'seed', 'reserve', 'release', 'sale', 'gift_allocation',
        'safety_allocation', 'adjustment'
      )`,
    ),
    check("ck_inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "ck_inventory_movements_actor_type",
      sql`${table.actorType} IN ('system', 'customer', 'admin')`,
    ),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type", { enum: ["system", "customer", "admin"] })
      .notNull()
      .default("system"),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [
    index("idx_audit_log_entity_created_at").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("idx_audit_log_actor_created_at").on(
      table.actorType,
      table.actorId,
      table.createdAt,
    ),
    uniqueIndex("ux_audit_log_idempotency_key").on(table.idempotencyKey),
    check(
      "ck_audit_log_actor_type",
      sql`${table.actorType} IN ('system', 'customer', 'admin')`,
    ),
  ],
);
