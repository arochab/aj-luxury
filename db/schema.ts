import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
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
    accountEnabledAt: text("account_enabled_at"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("ux_customers_email").on(table.email),
    index("idx_customers_account_enabled")
      .on(table.accountEnabledAt)
      .where(
        sql`${table.accountEnabledAt} IS NOT NULL AND ${table.deletedAt} IS NULL`,
      ),
    index("idx_customers_email_normalized")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
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
    fulfillmentRevision: integer("fulfillment_revision").notNull().default(0),
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
    shippingQuoteId: text("shipping_quote_id").references(
      (): AnySQLiteColumn => shippingQuotes.id,
      { onDelete: "restrict" },
    ),
    shippingAddressFingerprint: text("shipping_address_fingerprint"),
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
    uniqueIndex("ux_orders_shipping_quote_id")
      .on(table.shippingQuoteId)
      .where(sql`${table.shippingQuoteId} IS NOT NULL`),
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

export const accessChallenges = sqliteTable(
  "access_challenges",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose", {
      enum: ["customer_sign_in", "guest_order_access"],
    }).notNull(),
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    dispatchedAt: text("dispatched_at"),
    consumedAt: text("consumed_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_access_challenges_token_hash").on(table.tokenHash),
    index("idx_access_challenges_customer_active").on(
      table.customerId,
      table.purpose,
      table.expiresAt,
    ),
    index("idx_access_challenges_order_active").on(
      table.orderId,
      table.purpose,
      table.expiresAt,
    ),
    check(
      "ck_access_challenges_purpose",
      sql`${table.purpose} IN ('customer_sign_in', 'guest_order_access')`,
    ),
    check(
      "ck_access_challenges_target",
      sql`(
        ${table.purpose} = 'customer_sign_in' AND ${table.orderId} IS NULL
        AND (${table.customerId} IS NOT NULL OR ${table.revokedAt} IS NOT NULL)
      ) OR (
        ${table.purpose} = 'guest_order_access' AND ${table.customerId} IS NULL
        AND (${table.orderId} IS NOT NULL OR ${table.revokedAt} IS NOT NULL)
      )`,
    ),
    check(
      "ck_access_challenges_token_hash",
      sql`length(${table.tokenHash}) = 64
        AND ${table.tokenHash} = lower(${table.tokenHash})
        AND ${table.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "ck_access_challenges_timestamps",
      sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.expiresAt}) = ${table.expiresAt}
        AND ${table.expiresAt} > ${table.createdAt}
        AND CAST(strftime('%s', ${table.expiresAt}) AS integer)
          - CAST(strftime('%s', ${table.createdAt}) AS integer) <= 3600
        AND (${table.dispatchedAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.dispatchedAt}) = ${table.dispatchedAt})
        AND (${table.consumedAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.consumedAt}) = ${table.consumedAt})
        AND (${table.revokedAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.revokedAt}) = ${table.revokedAt})`,
    ),
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
    csrfTokenHash: text("csrf_token_hash"),
    sessionFamilyId: text("session_family_id").notNull(),
    authenticationSource: text("authentication_source", {
      enum: ["challenge", "rotation", "legacy_revoked"],
    }).notNull(),
    issuedByChallengeId: text("issued_by_challenge_id").references(
      () => accessChallenges.id,
      { onDelete: "restrict" },
    ),
    rotatedFromSessionId: text("rotated_from_session_id").references(
      (): AnySQLiteColumn => customerSessions.id,
      { onDelete: "restrict" },
    ),
    expiresAt: text("expires_at").notNull(),
    idleExpiresAt: text("idle_expires_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_customer_sessions_token_hash").on(table.tokenHash),
    uniqueIndex("ux_customer_sessions_issued_challenge")
      .on(table.issuedByChallengeId)
      .where(sql`${table.issuedByChallengeId} IS NOT NULL`),
    uniqueIndex("ux_customer_sessions_rotated_from")
      .on(table.rotatedFromSessionId)
      .where(sql`${table.rotatedFromSessionId} IS NOT NULL`),
    index("idx_customer_sessions_customer_expires_at").on(
      table.customerId,
      table.expiresAt,
    ),
    index("idx_customer_sessions_family_created_at").on(
      table.sessionFamilyId,
      table.createdAt,
    ),
    check(
      "ck_customer_sessions_authentication_source",
      sql`${table.authenticationSource} IN ('challenge', 'rotation', 'legacy_revoked')`,
    ),
    check(
      "ck_customer_sessions_source_shape",
      sql`(
        ${table.authenticationSource} = 'challenge'
        AND ${table.issuedByChallengeId} IS NOT NULL
        AND ${table.rotatedFromSessionId} IS NULL
      ) OR (
        ${table.authenticationSource} = 'rotation'
        AND ${table.issuedByChallengeId} IS NULL
        AND ${table.rotatedFromSessionId} IS NOT NULL
      ) OR (
        ${table.authenticationSource} = 'legacy_revoked'
        AND ${table.issuedByChallengeId} IS NULL
        AND ${table.rotatedFromSessionId} IS NULL
        AND ${table.revokedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const guestOrderSessions = sqliteTable(
  "guest_order_sessions",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    issuedByChallengeId: text("issued_by_challenge_id")
      .notNull()
      .references(() => accessChallenges.id, { onDelete: "restrict" }),
    expiresAt: text("expires_at").notNull(),
    idleExpiresAt: text("idle_expires_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_guest_order_sessions_token_hash").on(table.tokenHash),
    uniqueIndex("ux_guest_order_sessions_issued_challenge").on(
      table.issuedByChallengeId,
    ),
    index("idx_guest_order_sessions_order_expires_at").on(
      table.orderId,
      table.expiresAt,
    ),
    check(
      "ck_guest_order_sessions_token_hash",
      sql`length(${table.tokenHash}) = 64
        AND ${table.tokenHash} = lower(${table.tokenHash})
        AND ${table.tokenHash} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.csrfTokenHash}) = 64
        AND ${table.csrfTokenHash} = lower(${table.csrfTokenHash})
        AND ${table.csrfTokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "ck_guest_order_sessions_timestamps",
      sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.expiresAt}) = ${table.expiresAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.idleExpiresAt}) = ${table.idleExpiresAt}
        AND ${table.expiresAt} > ${table.createdAt}
        AND ${table.idleExpiresAt} > ${table.createdAt}
        AND ${table.idleExpiresAt} <= ${table.expiresAt}
        AND CAST(strftime('%s', ${table.expiresAt}) AS integer)
          - CAST(strftime('%s', ${table.createdAt}) AS integer) <= 86400
        AND CAST(strftime('%s', ${table.idleExpiresAt}) AS integer)
          - CAST(strftime('%s', ${table.createdAt}) AS integer) <= 900
        AND (${table.lastSeenAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.lastSeenAt}) = ${table.lastSeenAt})
        AND (${table.revokedAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.revokedAt}) = ${table.revokedAt})`,
    ),
  ],
);

export const administrators = sqliteTable(
  "administrators",
  {
    id: text("id").primaryKey(),
    externalSubjectHash: text("external_subject_hash").notNull(),
    role: text("role", { enum: ["owner", "operations"] }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    authzVersion: integer("authz_version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_administrators_external_subject_hash").on(
      table.externalSubjectHash,
    ),
    index("idx_administrators_enabled_role").on(table.enabled, table.role),
    check(
      "ck_administrators_subject_hash",
      sql`length(${table.externalSubjectHash}) = 64
        AND ${table.externalSubjectHash} = lower(${table.externalSubjectHash})
        AND ${table.externalSubjectHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "ck_administrators_role",
      sql`${table.role} IN ('owner', 'operations')`,
    ),
    check(
      "ck_administrators_enabled",
      sql`${table.enabled} IN (0, 1)`,
    ),
    check(
      "ck_administrators_authz_version",
      sql`${table.authzVersion} > 0`,
    ),
    check(
      "ck_administrators_timestamps",
      sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.updatedAt}) = ${table.updatedAt}
        AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    administratorId: text("administrator_id")
      .notNull()
      .references(() => administrators.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    authzVersion: integer("authz_version").notNull(),
    aal: integer("aal").notNull(),
    externalAuthenticatedAt: text("external_authenticated_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    idleExpiresAt: text("idle_expires_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_admin_sessions_token_hash").on(table.tokenHash),
    uniqueIndex("ux_admin_sessions_evidence_hash").on(table.evidenceHash),
    index("idx_admin_sessions_admin_expires_at").on(
      table.administratorId,
      table.expiresAt,
    ),
    check(
      "ck_admin_sessions_token_hash",
      sql`length(${table.tokenHash}) = 64
        AND ${table.tokenHash} = lower(${table.tokenHash})
        AND ${table.tokenHash} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.csrfTokenHash}) = 64
        AND ${table.csrfTokenHash} = lower(${table.csrfTokenHash})
        AND ${table.csrfTokenHash} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.evidenceHash}) = 64
        AND ${table.evidenceHash} = lower(${table.evidenceHash})
        AND ${table.evidenceHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check("ck_admin_sessions_aal", sql`${table.aal} >= 2`),
    check(
      "ck_admin_sessions_timestamps",
      sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${table.externalAuthenticatedAt}) = ${table.externalAuthenticatedAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.expiresAt}) = ${table.expiresAt}
        AND strftime('%Y-%m-%dT%H:%M:%fZ', ${table.idleExpiresAt}) = ${table.idleExpiresAt}
        AND ${table.externalAuthenticatedAt} <= ${table.createdAt}
        AND ${table.expiresAt} > ${table.createdAt}
        AND ${table.idleExpiresAt} > ${table.createdAt}
        AND ${table.idleExpiresAt} <= ${table.expiresAt}
        AND CAST(strftime('%s', ${table.createdAt}) AS integer)
          - CAST(strftime('%s', ${table.externalAuthenticatedAt}) AS integer) <= 300
        AND CAST(strftime('%s', ${table.expiresAt}) AS integer)
          - CAST(strftime('%s', ${table.createdAt}) AS integer) <= 28800
        AND CAST(strftime('%s', ${table.idleExpiresAt}) AS integer)
          - CAST(strftime('%s', ${table.createdAt}) AS integer) <= 900
        AND (${table.lastSeenAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.lastSeenAt}) = ${table.lastSeenAt})
        AND (${table.revokedAt} IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ${table.revokedAt}) = ${table.revokedAt})`,
    ),
  ],
);

export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    kind: text("kind", {
      enum: [
        "payment_confirmation",
        "order_confirmation",
        "payment_failed",
        "shipment_confirmation",
        "refund_confirmation",
        "return_acknowledgement",
        "withdrawal_acknowledgement",
        "account_access",
      ],
    }).notNull(),
    transactionIntent: text("transaction_intent", {
      enum: [
        "payment_succeeded",
        "payment_failed",
        "shipment_created",
        "refund_succeeded",
        "return_received",
        "withdrawal_received",
        "account_access_challenge",
      ],
    })
      .notNull()
      .default("payment_succeeded"),
    sourceEventId: text("source_event_id").notNull().default("compat:pending"),
    recipientEmail: text("recipient_email"),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    accessChallengeId: text("access_challenge_id").references(
      () => accessChallenges.id,
      { onDelete: "restrict" },
    ),
    locale: text("locale", { enum: ["fr", "en"] })
      .notNull()
      .default("fr"),
    templateVersion: text("template_version").notNull(),
    payloadJson: text("payload_json"),
    status: text("status", {
      enum: ["pending", "sending", "sent", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: text("next_attempt_at"),
    leaseTokenHash: text("lease_token_hash"),
    leasedAt: text("leased_at"),
    leaseExpiresAt: text("lease_expires_at"),
    lastErrorCode: text("last_error_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerIdempotencyKey: text("provider_idempotency_key")
      .notNull()
      .default("compat:pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull().default(utcNow),
    sentAt: text("sent_at"),
    terminalAt: text("terminal_at"),
    purgedAt: text("purged_at"),
  },
  (table) => [
    uniqueIndex("ux_email_outbox_idempotency_key").on(table.idempotencyKey),
    uniqueIndex("ux_email_outbox_intent_source").on(
      table.transactionIntent,
      table.sourceEventId,
    ),
    uniqueIndex("ux_email_outbox_provider_idempotency_key").on(
      table.providerIdempotencyKey,
    ),
    uniqueIndex("ux_email_outbox_account_access_challenge")
      .on(table.accessChallengeId)
      .where(
        sql`${table.kind} = 'account_access' AND ${table.accessChallengeId} IS NOT NULL`,
      ),
    uniqueIndex("ux_email_outbox_payment_confirmation_order")
      .on(table.orderId)
      .where(sql`${table.kind} = 'payment_confirmation'`),
    uniqueIndex("ux_email_outbox_active_lease")
      .on(table.leaseTokenHash)
      .where(sql`${table.leaseTokenHash} IS NOT NULL`),
    index("idx_email_outbox_claim").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    index("idx_email_outbox_stale_lease").on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      "ck_email_outbox_kind",
      sql`${table.kind} IN (
        'payment_confirmation', 'payment_failed', 'shipment_confirmation',
        'refund_confirmation', 'return_acknowledgement',
        'withdrawal_acknowledgement', 'account_access',
        'order_confirmation'
      )`,
    ),
    check(
      "ck_email_outbox_intent",
      sql`(${table.kind} = 'payment_confirmation' AND ${table.transactionIntent} = 'payment_succeeded')
        OR (${table.kind} = 'payment_failed' AND ${table.transactionIntent} = 'payment_failed')
        OR (${table.kind} = 'shipment_confirmation' AND ${table.transactionIntent} = 'shipment_created')
        OR (${table.kind} = 'refund_confirmation' AND ${table.transactionIntent} = 'refund_succeeded')
        OR (${table.kind} = 'return_acknowledgement' AND ${table.transactionIntent} = 'return_received')
        OR (${table.kind} = 'withdrawal_acknowledgement' AND ${table.transactionIntent} = 'withdrawal_received')
        OR (${table.kind} = 'account_access' AND ${table.transactionIntent} = 'account_access_challenge')
        OR (${table.kind} = 'order_confirmation' AND ${table.transactionIntent} = 'payment_succeeded')`,
    ),
    check(
      "ck_email_outbox_status",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      "ck_email_outbox_locale",
      sql`${table.locale} IN ('fr', 'en')`,
    ),
    check(
      "ck_email_outbox_attempts",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} >= 1
        AND ${table.attempts} <= ${table.maxAttempts}
        AND (${table.kind} <> 'account_access' OR ${table.maxAttempts} = 1)`,
    ),
    check(
      "ck_email_outbox_error_code",
      sql`${table.lastErrorCode} IS NULL OR ${table.lastErrorCode} IN (
        'provider_rejected', 'delivery_ambiguous', 'attempts_exhausted',
        'legacy_magic_link_invalidated', 'legacy_unverified_payment_intent',
        'legacy_ambiguous_delivery', 'legacy_duplicate_intent'
      )`,
    ),
    check(
      "ck_email_outbox_content_purge",
      sql`(${table.purgedAt} IS NULL AND ${table.recipientEmail} IS NOT NULL AND ${table.payloadJson} IS NOT NULL)
        OR (${table.purgedAt} IS NOT NULL AND ${table.recipientEmail} IS NULL
          AND ${table.payloadJson} IS NULL
          AND ${table.status} IN ('sent', 'failed', 'cancelled'))`,
    ),
    check(
      "ck_email_outbox_account_access_historical",
      sql`${table.kind} <> 'account_access' OR (
        ${table.status} IN ('sent', 'failed', 'cancelled')
        AND ${table.purgedAt} IS NOT NULL
        AND ${table.recipientEmail} IS NULL AND ${table.payloadJson} IS NULL
        AND ${table.nextAttemptAt} IS NULL
        AND ${table.leaseTokenHash} IS NULL AND ${table.leasedAt} IS NULL
        AND ${table.leaseExpiresAt} IS NULL AND ${table.terminalAt} IS NOT NULL
      )`,
    ),
    check(
      "ck_email_outbox_state_shape",
      sql`(${table.status} = 'pending' AND ${table.nextAttemptAt} IS NOT NULL
          AND ${table.leaseTokenHash} IS NULL AND ${table.leasedAt} IS NULL
          AND ${table.leaseExpiresAt} IS NULL AND ${table.sentAt} IS NULL
          AND ${table.terminalAt} IS NULL)
        OR (${table.status} = 'sending' AND ${table.attempts} >= 1
          AND ${table.nextAttemptAt} IS NULL AND ${table.leaseTokenHash} IS NOT NULL
          AND ${table.leasedAt} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL
          AND ${table.sentAt} IS NULL AND ${table.terminalAt} IS NULL)
        OR (${table.status} = 'sent' AND ${table.nextAttemptAt} IS NULL
          AND ${table.leaseTokenHash} IS NULL AND ${table.leasedAt} IS NULL
          AND ${table.leaseExpiresAt} IS NULL AND ${table.sentAt} IS NOT NULL
          AND ${table.terminalAt} IS NOT NULL)
        OR (${table.status} IN ('failed', 'cancelled') AND ${table.nextAttemptAt} IS NULL
          AND ${table.leaseTokenHash} IS NULL AND ${table.leasedAt} IS NULL
          AND ${table.leaseExpiresAt} IS NULL AND ${table.sentAt} IS NULL
          AND ${table.terminalAt} IS NOT NULL)`,
    ),
    check(
      "ck_email_outbox_lease_hash",
      sql`${table.leaseTokenHash} IS NULL OR (
        length(${table.leaseTokenHash}) = 64
        AND ${table.leaseTokenHash} = lower(${table.leaseTokenHash})
        AND ${table.leaseTokenHash} NOT GLOB '*[^0-9a-f]*'
      )`,
    ),
  ],
);

export const dataRetentionRules = sqliteTable(
  "data_retention_rules",
  {
    id: text("id").primaryKey(),
    recordClass: text("record_class", {
      enum: ["customer_profile", "email_content", "order_record"],
    }).notNull(),
    policyVersion: text("policy_version").notNull(),
    retentionSeconds: integer("retention_seconds"),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    effectiveAt: text("effective_at"),
    createdByAdminId: text("created_by_admin_id").references(
      () => administrators.id,
      { onDelete: "restrict" },
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_data_retention_active_class")
      .on(table.recordClass)
      .where(sql`${table.active} = 1`),
    check(
      "ck_data_retention_class",
      sql`${table.recordClass} IN ('customer_profile', 'email_content', 'order_record')`,
    ),
    check("ck_data_retention_active", sql`${table.active} IN (0, 1)`),
    check(
      "ck_data_retention_duration",
      sql`${table.retentionSeconds} IS NULL OR ${table.retentionSeconds} >= 0`,
    ),
    check(
      "ck_data_retention_activation",
      sql`${table.active} = 0 OR (
        ${table.retentionSeconds} IS NOT NULL AND ${table.effectiveAt} IS NOT NULL
        AND ${table.createdByAdminId} IS NOT NULL
      )`,
    ),
  ],
);

export const dataRightsRequests = sqliteTable(
  "data_rights_requests",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["export", "rectification", "erasure"] })
      .notNull(),
    actorType: text("actor_type", { enum: ["customer", "guest", "admin"] })
      .notNull(),
    actorCustomerId: text("actor_customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    actorOrderId: text("actor_order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    actorAdminId: text("actor_admin_id").references(() => administrators.id, {
      onDelete: "restrict",
    }),
    targetCustomerId: text("target_customer_id").references(
      () => customers.id,
      { onDelete: "restrict" },
    ),
    targetOrderId: text("target_order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    requestedFieldsJson: text("requested_fields_json").notNull().default("[]"),
    status: text("status", { enum: ["pending", "completed", "rejected"] })
      .notNull()
      .default("pending"),
    retentionDecision: text("retention_decision", {
      enum: ["unevaluated", "retain", "erase"],
    })
      .notNull()
      .default("unevaluated"),
    retentionPolicyVersion: text("retention_policy_version"),
    retentionRequiredUntil: text("retention_required_until"),
    activeDispute: integer("active_dispute", { mode: "boolean" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("ux_data_rights_idempotency").on(table.idempotencyKey),
    index("idx_data_rights_target_customer").on(
      table.targetCustomerId,
      table.createdAt,
    ),
    index("idx_data_rights_target_order").on(
      table.targetOrderId,
      table.createdAt,
    ),
    check(
      "ck_data_rights_kind",
      sql`${table.kind} IN ('export', 'rectification', 'erasure')`,
    ),
    check(
      "ck_data_rights_status",
      sql`${table.status} IN ('pending', 'completed', 'rejected')`,
    ),
    check(
      "ck_data_rights_actor",
      sql`(${table.actorType} = 'customer' AND ${table.actorCustomerId} IS NOT NULL
          AND ${table.actorOrderId} IS NULL AND ${table.actorAdminId} IS NULL
          AND ${table.targetCustomerId} = ${table.actorCustomerId}
          AND ${table.targetOrderId} IS NULL)
        OR (${table.actorType} = 'guest' AND ${table.actorCustomerId} IS NULL
          AND ${table.actorOrderId} IS NOT NULL AND ${table.actorAdminId} IS NULL
          AND ${table.targetCustomerId} IS NULL
          AND ${table.targetOrderId} = ${table.actorOrderId})
        OR (${table.actorType} = 'admin' AND ${table.actorCustomerId} IS NULL
          AND ${table.actorOrderId} IS NULL AND ${table.actorAdminId} IS NOT NULL
          AND ((${table.targetCustomerId} IS NOT NULL AND ${table.targetOrderId} IS NULL)
            OR (${table.targetCustomerId} IS NULL AND ${table.targetOrderId} IS NOT NULL)))`,
    ),
    check(
      "ck_data_rights_retention",
      sql`(${table.retentionDecision} = 'unevaluated'
          AND ${table.retentionPolicyVersion} IS NULL
          AND ${table.retentionRequiredUntil} IS NULL
          AND ${table.activeDispute} IS NULL)
        OR (${table.retentionDecision} IN ('retain', 'erase')
          AND ${table.retentionPolicyVersion} IS NOT NULL
          AND ${table.retentionRequiredUntil} IS NOT NULL
          AND ${table.activeDispute} IN (0, 1))`,
    ),
    check(
      "ck_data_rights_completion",
      sql`(${table.status} = 'pending' AND ${table.completedAt} IS NULL)
        OR (${table.status} IN ('completed', 'rejected')
          AND ${table.completedAt} IS NOT NULL)`,
    ),
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

export const shippingZoneConfigurations = sqliteTable(
  "shipping_zone_configurations",
  {
    id: text("id").primaryKey(),
    zone: text("zone", { enum: ["EU", "UK", "US", "CA"] }).notNull(),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "active", "retired"] })
      .notNull()
      .default("draft"),
    serviceCode: text("service_code"),
    priceCents: integer("price_cents"),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    estimatedDaysMin: integer("estimated_days_min"),
    estimatedDaysMax: integer("estimated_days_max"),
    dutiesTerms: text("duties_terms", {
      enum: ["EU_INCLUDED", "DAP", "DDP"],
    }),
    parcelCode: text("parcel_code"),
    parcelWeightGrams: integer("parcel_weight_grams"),
    parcelLengthMm: integer("parcel_length_mm"),
    parcelWidthMm: integer("parcel_width_mm"),
    parcelHeightMm: integer("parcel_height_mm"),
    originCountryCode: text("origin_country_code"),
    customsHsCode: text("customs_hs_code"),
    activatedAt: text("activated_at"),
    retiredAt: text("retired_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_shipping_zone_configurations_version").on(
      table.zone,
      table.version,
    ),
    uniqueIndex("ux_shipping_zone_configurations_active")
      .on(table.zone)
      .where(sql`${table.status} = 'active'`),
    check(
      "ck_shipping_zone_configurations_zone",
      sql`${table.zone} IN ('EU', 'UK', 'US', 'CA')`,
    ),
    check(
      "ck_shipping_zone_configurations_status",
      sql`${table.status} IN ('draft', 'active', 'retired')`,
    ),
    check("ck_shipping_zone_configurations_version", sql`${table.version} > 0`),
    check("ck_shipping_zone_configurations_currency", sql`${table.currency} = 'EUR'`),
    check(
      "ck_shipping_zone_configurations_price",
      sql`${table.priceCents} IS NULL OR ${table.priceCents} >= 0`,
    ),
    check(
      "ck_shipping_zone_configurations_delays",
      sql`(${table.estimatedDaysMin} IS NULL AND ${table.estimatedDaysMax} IS NULL)
        OR (${table.estimatedDaysMin} > 0
          AND ${table.estimatedDaysMax} >= ${table.estimatedDaysMin})`,
    ),
    check(
      "ck_shipping_zone_configurations_duties",
      sql`${table.dutiesTerms} IS NULL
        OR ${table.dutiesTerms} IN ('EU_INCLUDED', 'DAP', 'DDP')`,
    ),
    check(
      "ck_shipping_zone_configurations_parcel",
      sql`(${table.parcelWeightGrams} IS NULL
          AND ${table.parcelLengthMm} IS NULL
          AND ${table.parcelWidthMm} IS NULL
          AND ${table.parcelHeightMm} IS NULL)
        OR (${table.parcelWeightGrams} > 0
          AND ${table.parcelLengthMm} > 0
          AND ${table.parcelWidthMm} > 0
          AND ${table.parcelHeightMm} > 0)`,
    ),
  ],
);

export const shippingQuotes = sqliteTable(
  "shipping_quotes",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    cartFingerprint: text("cart_fingerprint").notNull(),
    cartRevision: integer("cart_revision").notNull(),
    configurationId: text("configuration_id")
      .notNull()
      .references(() => shippingZoneConfigurations.id, { onDelete: "restrict" }),
    shippingAddressJson: text("shipping_address_json").notNull(),
    shippingAddressFingerprint: text("shipping_address_fingerprint").notNull(),
    providerQuoteReference: text("provider_quote_reference"),
    providerReceiptFingerprint: text("provider_receipt_fingerprint"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    estimatedDaysMin: integer("estimated_days_min").notNull(),
    estimatedDaysMax: integer("estimated_days_max").notNull(),
    dutiesTerms: text("duties_terms", {
      enum: ["EU_INCLUDED", "DAP", "DDP"],
    }).notNull(),
    expiresAt: text("expires_at").notNull(),
    selectedAt: text("selected_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_shipping_quotes_selected_cart")
      .on(table.cartId)
      .where(sql`${table.selectedAt} IS NOT NULL`),
    index("idx_shipping_quotes_cart_expires_at").on(table.cartId, table.expiresAt),
    index("idx_shipping_quotes_configuration").on(table.configurationId),
    check("ck_shipping_quotes_amount", sql`${table.amountCents} >= 0`),
    check("ck_shipping_quotes_cart_revision", sql`${table.cartRevision} >= 0`),
    check("ck_shipping_quotes_currency", sql`${table.currency} = 'EUR'`),
    check(
      "ck_shipping_quotes_delays",
      sql`${table.estimatedDaysMin} > 0
        AND ${table.estimatedDaysMax} >= ${table.estimatedDaysMin}`,
    ),
    check(
      "ck_shipping_quotes_duties",
      sql`${table.dutiesTerms} IN ('EU_INCLUDED', 'DAP', 'DDP')`,
    ),
    check(
      "ck_shipping_quotes_fingerprints",
      sql`length(${table.cartFingerprint}) = 64
        AND ${table.cartFingerprint} = lower(${table.cartFingerprint})
        AND ${table.cartFingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.shippingAddressFingerprint}) = 64
        AND ${table.shippingAddressFingerprint} = lower(${table.shippingAddressFingerprint})
        AND ${table.shippingAddressFingerprint} NOT GLOB '*[^0-9a-f]*'
        AND (${table.providerReceiptFingerprint} IS NULL
          OR (length(${table.providerReceiptFingerprint}) = 64
            AND ${table.providerReceiptFingerprint} = lower(${table.providerReceiptFingerprint})
            AND ${table.providerReceiptFingerprint} NOT GLOB '*[^0-9a-f]*'))`,
    ),
  ],
);

export const shippingQuoteParcelSnapshots = sqliteTable(
  "shipping_quote_parcel_snapshots",
  {
    quoteId: text("quote_id")
      .primaryKey()
      .references(() => shippingQuotes.id, { onDelete: "cascade" }),
    profileCode: text("profile_code", {
      enum: [
        "AJL_ENVELOPE_1_ITEM_V1",
        "AJL_ENVELOPE_2_ITEMS_V1",
        "AJL_ENVELOPE_3_ITEMS_V1",
      ],
    }).notNull(),
    sourceVersion: text("source_version", {
      enum: ["client-validated-2026-08-13"],
    }).notNull(),
    itemCount: integer("item_count").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    lengthMm: integer("length_mm").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "ck_shipping_quote_parcel_snapshots_exact_profile",
      sql`${table.sourceVersion} = 'client-validated-2026-08-13'
        AND ${table.lengthMm} = 400
        AND ${table.widthMm} = 320
        AND ${table.heightMm} = 40
        AND (
          (${table.itemCount} = 1
            AND ${table.profileCode} = 'AJL_ENVELOPE_1_ITEM_V1'
            AND ${table.weightGrams} = 150)
          OR (${table.itemCount} = 2
            AND ${table.profileCode} = 'AJL_ENVELOPE_2_ITEMS_V1'
            AND ${table.weightGrams} = 250)
          OR (${table.itemCount} = 3
            AND ${table.profileCode} = 'AJL_ENVELOPE_3_ITEMS_V1'
            AND ${table.weightGrams} = 350)
        )`,
    ),
  ],
);

export const deliveryOptionSnapshots = sqliteTable(
  "delivery_option_snapshots",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id").notNull().references(() => carts.id, { onDelete: "restrict" }),
    cartRevision: integer("cart_revision").notNull(),
    shippingQuoteId: text("shipping_quote_id").notNull().references(
      () => shippingQuotes.id,
      { onDelete: "restrict" },
    ),
    shippingAddressFingerprint: text("shipping_address_fingerprint").notNull(),
    providerCode: text("provider_code").notNull(),
    carrierCode: text("carrier_code").notNull(),
    serviceCode: text("service_code").notNull(),
    displayName: text("display_name").notNull(),
    deliveryMode: text("delivery_mode", { enum: ["home", "service_point"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    estimatedDaysMin: integer("estimated_days_min").notNull(),
    estimatedDaysMax: integer("estimated_days_max").notNull(),
    dutiesTerms: text("duties_terms", { enum: ["EU_INCLUDED", "DAP", "DDP"] }).notNull(),
    proofKind: text("proof_kind", { enum: ["synthetic_demo", "provider_api_response"] }).notNull(),
    providerQuoteReferenceHash: text("provider_quote_reference_hash"),
    providerReceiptFingerprint: text("provider_receipt_fingerprint"),
    quotedAt: text("quoted_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    selectedAt: text("selected_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_delivery_options_quote").on(table.shippingQuoteId),
    uniqueIndex("ux_delivery_options_selected_cart")
      .on(table.cartId)
      .where(sql`${table.selectedAt} IS NOT NULL`),
    index("idx_delivery_options_cart_expiry").on(table.cartId, table.expiresAt),
  ],
);

export const deliveryServicePointSnapshots = sqliteTable(
  "delivery_service_point_snapshots",
  {
    id: text("id").primaryKey(),
    deliveryOptionId: text("delivery_option_id").notNull().references(
      () => deliveryOptionSnapshots.id,
      { onDelete: "restrict" },
    ),
    providerPointReferenceHash: text("provider_point_reference_hash").notNull(),
    displayName: text("display_name").notNull(),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    countryCode: text("country_code").notNull(),
    openingHoursSummary: text("opening_hours_summary"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_delivery_service_point_provider_ref").on(
      table.deliveryOptionId,
      table.providerPointReferenceHash,
    ),
    index("idx_delivery_service_points_option_expiry").on(
      table.deliveryOptionId,
      table.expiresAt,
    ),
  ],
);
export const shipments = sqliteTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    shippingQuoteId: text("shipping_quote_id")
      .notNull()
      .references(() => shippingQuotes.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: [
        "label_pending",
        "label_claimed",
        "label_ready",
        "handed_over",
        "in_transit",
        "delivered",
        "failed",
      ],
    })
      .notNull()
      .default("label_pending"),
    providerShipmentReference: text("provider_shipment_reference"),
    trackingProviderCode: text("tracking_provider_code"),
    trackingReference: text("tracking_reference"),
    providerReceiptFingerprint: text("provider_receipt_fingerprint"),
    idempotencyKey: text("idempotency_key").notNull(),
    leaseTokenHash: text("lease_token_hash"),
    leasedAt: text("leased_at"),
    leaseExpiresAt: text("lease_expires_at"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastErrorCode: text("last_error_code"),
    labelCreatedAt: text("label_created_at"),
    handedOverAt: text("handed_over_at"),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_shipments_order").on(table.orderId),
    uniqueIndex("ux_shipments_idempotency").on(table.idempotencyKey),
    uniqueIndex("ux_shipments_provider_reference")
      .on(table.providerShipmentReference)
      .where(sql`${table.providerShipmentReference} IS NOT NULL`),
    uniqueIndex("ux_shipments_tracking_reference")
      .on(table.trackingReference)
      .where(sql`${table.trackingReference} IS NOT NULL`),
    uniqueIndex("ux_shipments_active_lease")
      .on(table.leaseTokenHash)
      .where(sql`${table.leaseTokenHash} IS NOT NULL`),
    index("idx_shipments_status_lease").on(table.status, table.leaseExpiresAt),
    check(
      "ck_shipments_status",
      sql`${table.status} IN (
        'label_pending', 'label_claimed', 'label_ready', 'handed_over',
        'in_transit', 'delivered', 'failed'
      )`,
    ),
    check(
      "ck_shipments_attempts",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} >= 1
        AND ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      "ck_shipments_receipt_fingerprint",
      sql`${table.providerReceiptFingerprint} IS NULL
        OR (length(${table.providerReceiptFingerprint}) = 64
          AND ${table.providerReceiptFingerprint} = lower(${table.providerReceiptFingerprint})
          AND ${table.providerReceiptFingerprint} NOT GLOB '*[^0-9a-f]*')`,
    ),
  ],
);

export const shippingDocumentMetadata = sqliteTable(
  "shipping_document_metadata",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id").notNull().references(
      () => shipments.id,
      { onDelete: "restrict" },
    ),
    documentKind: text("document_kind", {
      enum: ["label", "customs", "return_label"],
    }).notNull(),
    mediaType: text("media_type", {
      enum: ["application/pdf", "image/png", "application/zpl"],
    }).notNull(),
    providerDocumentReferenceHash: text("provider_document_reference_hash").notNull(),
    contentSha256: text("content_sha256").notNull(),
    byteLength: integer("byte_length").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_shipping_document_reference").on(
      table.shipmentId,
      table.documentKind,
      table.providerDocumentReferenceHash,
    ),
  ],
);

export const carrierEventReceipts = sqliteTable(
  "carrier_event_receipts",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    providerCode: text("provider_code").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    trackingReference: text("tracking_reference").notNull(),
    eventType: text("event_type", {
      enum: [
        "in_transit",
        "out_for_delivery",
        "delivered",
        "exception",
        "returned",
      ],
    }).notNull(),
    eventFingerprint: text("event_fingerprint").notNull(),
    receiptFingerprint: text("receipt_fingerprint").notNull(),
    verificationMethod: text("verification_method", {
      enum: ["test_adapter", "carrier_signature"],
    }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    receivedAt: text("received_at").notNull(),
    verifiedAt: text("verified_at").notNull(),
    status: text("status", { enum: ["verified", "consumed"] })
      .notNull()
      .default("verified"),
    consumedAt: text("consumed_at"),
  },
  (table) => [
    uniqueIndex("ux_carrier_receipts_provider_event").on(
      table.providerCode,
      table.providerEventId,
    ),
    uniqueIndex("ux_carrier_receipts_fingerprint").on(table.receiptFingerprint),
    index("idx_carrier_receipts_shipment_status").on(table.shipmentId, table.status),
    check(
      "ck_carrier_receipts_type",
      sql`${table.eventType} IN (
        'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'
      )`,
    ),
    check(
      "ck_carrier_receipts_verification_method",
      sql`${table.verificationMethod} IN ('test_adapter', 'carrier_signature')`,
    ),
    check(
      "ck_carrier_receipts_fingerprints",
      sql`length(${table.eventFingerprint}) = 64
        AND ${table.eventFingerprint} = lower(${table.eventFingerprint})
        AND ${table.eventFingerprint} NOT GLOB '*[^0-9a-f]*'
        AND length(${table.receiptFingerprint}) = 64
        AND ${table.receiptFingerprint} = lower(${table.receiptFingerprint})
        AND ${table.receiptFingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "ck_carrier_receipts_state",
      sql`(${table.status} = 'verified' AND ${table.consumedAt} IS NULL)
        OR (${table.status} = 'consumed' AND ${table.consumedAt} IS NOT NULL)`,
    ),
  ],
);

export const shipmentTrackingEvents = sqliteTable(
  "shipment_tracking_events",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    providerCode: text("provider_code").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    carrierReceiptId: text("carrier_receipt_id").references(
      () => carrierEventReceipts.id,
      { onDelete: "restrict" },
    ),
    trackingReference: text("tracking_reference").notNull(),
    eventType: text("event_type", {
      enum: [
        "handed_over",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "exception",
        "returned",
      ],
    }).notNull(),
    eventFingerprint: text("event_fingerprint").notNull(),
    occurredAt: text("occurred_at").notNull(),
    receivedAt: text("received_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_tracking_events_provider_event").on(
      table.providerCode,
      table.providerEventId,
    ),
    uniqueIndex("ux_tracking_events_carrier_receipt")
      .on(table.carrierReceiptId)
      .where(sql`${table.carrierReceiptId} IS NOT NULL`),
    uniqueIndex("ux_tracking_events_handover_shipment")
      .on(table.shipmentId)
      .where(sql`${table.eventType} = 'handed_over'`),
    index("idx_tracking_events_shipment_received").on(
      table.shipmentId,
      table.receivedAt,
    ),
    check(
      "ck_tracking_events_type",
      sql`${table.eventType} IN (
        'handed_over', 'in_transit', 'out_for_delivery', 'delivered',
        'exception', 'returned'
      )`,
    ),
    check(
      "ck_tracking_events_fingerprint",
      sql`length(${table.eventFingerprint}) = 64
        AND ${table.eventFingerprint} = lower(${table.eventFingerprint})
        AND ${table.eventFingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "ck_tracking_events_receipt_shape",
      sql`(${table.eventType} = 'handed_over' AND ${table.carrierReceiptId} IS NULL)
        OR (${table.eventType} <> 'handed_over' AND ${table.carrierReceiptId} IS NOT NULL)`,
    ),
  ],
);

export const returnRequests = sqliteTable(
  "return_requests",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["return", "withdrawal"] }).notNull(),
    source: text("source", { enum: ["customer", "guest", "admin"] }).notNull(),
    actorCustomerId: text("actor_customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    guestOrderSessionId: text("guest_order_session_id").references(
      () => guestOrderSessions.id,
      { onDelete: "restrict" },
    ),
    actorAdminId: text("actor_admin_id").references(
      () => administrators.id,
      { onDelete: "restrict" },
    ),
    declarationFingerprint: text("declaration_fingerprint").notNull(),
    declaredLineCount: integer("declared_line_count").notNull(),
    status: text("status", {
      enum: [
        "received",
        "approved",
        "goods_received",
        "inspected",
        "resolved",
        "rejected",
        "cancelled",
      ],
    })
      .notNull()
      .default("received"),
    resolution: text("resolution", {
      enum: ["pending", "refund", "rejected", "no_refund"],
    })
      .notNull()
      .default("pending"),
    requestedAt: text("requested_at").notNull(),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_return_requests_declaration").on(
      table.orderId,
      table.declarationFingerprint,
    ),
    index("idx_return_requests_order_status").on(table.orderId, table.status),
    check("ck_return_requests_kind", sql`${table.kind} IN ('return', 'withdrawal')`),
    check(
      "ck_return_requests_source",
      sql`(${table.source} = 'customer' AND ${table.actorCustomerId} IS NOT NULL
          AND ${table.guestOrderSessionId} IS NULL AND ${table.actorAdminId} IS NULL)
        OR (${table.source} = 'guest' AND ${table.actorCustomerId} IS NULL
          AND ${table.guestOrderSessionId} IS NOT NULL AND ${table.actorAdminId} IS NULL)
        OR (${table.source} = 'admin' AND ${table.actorCustomerId} IS NULL
          AND ${table.guestOrderSessionId} IS NULL AND ${table.actorAdminId} IS NOT NULL)`,
    ),
    check(
      "ck_return_requests_status",
      sql`${table.status} IN (
        'received', 'approved', 'goods_received', 'inspected', 'resolved',
        'rejected', 'cancelled'
      )`,
    ),
    check(
      "ck_return_requests_resolution",
      sql`${table.resolution} IN ('pending', 'refund', 'rejected', 'no_refund')`,
    ),
    check(
      "ck_return_requests_fingerprint",
      sql`length(${table.declarationFingerprint}) = 64
        AND ${table.declarationFingerprint} = lower(${table.declarationFingerprint})
        AND ${table.declarationFingerprint} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check("ck_return_requests_declared_lines", sql`${table.declaredLineCount} > 0`),
  ],
);

export const returnLines = sqliteTable(
  "return_lines",
  {
    id: text("id").primaryKey(),
    returnRequestId: text("return_request_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "restrict" }),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLines.id, { onDelete: "restrict" }),
    requestedQuantity: integer("requested_quantity").notNull(),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    sellableQuantity: integer("sellable_quantity").notNull().default(0),
    nonSellableQuantity: integer("non_sellable_quantity").notNull().default(0),
    restockedQuantity: integer("restocked_quantity").notNull().default(0),
    inspectionResult: text("inspection_result", {
      enum: ["pending", "complete"],
    })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_return_lines_request_order_line").on(
      table.returnRequestId,
      table.orderLineId,
    ),
    index("idx_return_lines_order_line").on(table.orderLineId),
    check(
      "ck_return_lines_quantities",
      sql`${table.requestedQuantity} > 0
        AND ${table.receivedQuantity} >= 0
        AND ${table.receivedQuantity} <= ${table.requestedQuantity}
        AND ${table.sellableQuantity} >= 0
        AND ${table.nonSellableQuantity} >= 0
        AND ${table.sellableQuantity} + ${table.nonSellableQuantity} = ${table.receivedQuantity}
        AND ${table.restockedQuantity} >= 0
        AND ${table.restockedQuantity} <= ${table.sellableQuantity}`,
    ),
    check(
      "ck_return_lines_inspection",
      sql`(${table.inspectionResult} = 'pending'
          AND ${table.receivedQuantity} = 0
          AND ${table.sellableQuantity} = 0
          AND ${table.nonSellableQuantity} = 0
          AND ${table.restockedQuantity} = 0)
        OR ${table.inspectionResult} = 'complete'`,
    ),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    returnRequestId: text("return_request_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "restrict" }),
    reason: text("reason", { enum: ["return", "withdrawal"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] }).notNull().default("EUR"),
    status: text("status", {
      enum: ["pending", "claimed", "succeeded", "failed"],
    })
      .notNull()
      .default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    leaseTokenHash: text("lease_token_hash"),
    leasedAt: text("leased_at"),
    leaseExpiresAt: text("lease_expires_at"),
    providerRefundReference: text("provider_refund_reference"),
    providerReceiptFingerprint: text("provider_receipt_fingerprint"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastErrorCode: text("last_error_code"),
    succeededAt: text("succeeded_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_refunds_idempotency").on(table.idempotencyKey),
    uniqueIndex("ux_refunds_provider_reference")
      .on(table.providerRefundReference)
      .where(sql`${table.providerRefundReference} IS NOT NULL`),
    uniqueIndex("ux_refunds_active_lease")
      .on(table.leaseTokenHash)
      .where(sql`${table.leaseTokenHash} IS NOT NULL`),
    index("idx_refunds_payment_status").on(table.paymentId, table.status),
    check("ck_refunds_reason", sql`${table.reason} IN ('return', 'withdrawal')`),
    check("ck_refunds_amount", sql`${table.amountCents} > 0`),
    check("ck_refunds_currency", sql`${table.currency} = 'EUR'`),
    check(
      "ck_refunds_status",
      sql`${table.status} IN ('pending', 'claimed', 'succeeded', 'failed')`,
    ),
    check(
      "ck_refunds_attempts",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} >= 1
        AND ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      "ck_refunds_receipt_fingerprint",
      sql`${table.providerReceiptFingerprint} IS NULL
        OR (length(${table.providerReceiptFingerprint}) = 64
          AND ${table.providerReceiptFingerprint} = lower(${table.providerReceiptFingerprint})
          AND ${table.providerReceiptFingerprint} NOT GLOB '*[^0-9a-f]*')`,
    ),
  ],
);

export const customsRecords = sqliteTable(
  "customs_records",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["pending", "ready", "blocked"] })
      .notNull()
      .default("pending"),
    manualReference: text("manual_reference"),
    recordFingerprint: text("record_fingerprint"),
    readyAt: text("ready_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_customs_records_shipment").on(table.shipmentId),
    check(
      "ck_customs_records_status",
      sql`${table.status} IN ('pending', 'ready', 'blocked')`,
    ),
    check(
      "ck_customs_records_fingerprint",
      sql`${table.recordFingerprint} IS NULL
        OR (length(${table.recordFingerprint}) = 64
          AND ${table.recordFingerprint} = lower(${table.recordFingerprint})
          AND ${table.recordFingerprint} NOT GLOB '*[^0-9a-f]*')`,
    ),
    check(
      "ck_customs_records_ready_shape",
      sql`(${table.status} = 'ready' AND ${table.manualReference} IS NOT NULL
          AND ${table.recordFingerprint} IS NOT NULL AND ${table.readyAt} IS NOT NULL)
        OR (${table.status} <> 'ready' AND ${table.readyAt} IS NULL)`,
    ),
  ],
);
