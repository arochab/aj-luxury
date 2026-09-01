import { isCanonicalUtcTimestamp } from "./account-security.ts";
import type { CommerceD1Database, CommerceD1Result } from "./d1-port.ts";
import type { ShippingDocumentProviderPort } from "./delivery-provider.ts";
import type { TransactionalEmailProviderPort } from "./email-outbox.ts";
import { sha256Hex } from "./fulfillment-domain.ts";

const RECIPIENT = "jeremy@ajluxurystore.com";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SAFE_TRACKING_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const SAFE_PROVIDER_REFERENCE = /^[1-9]\d{0,18}$/;
const SAFE_PROVIDER_MESSAGE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SAFE_ORDER_NUMBER = /^[A-Z0-9][A-Z0-9-]{0,80}$/;
const RETRY_SECONDS = Object.freeze([60, 300, 1_800, 7_200] as const);

type Candidate = Readonly<{
  id: string;
  shipment_id: string;
  order_id: string;
  recipient_email: string;
  attempts: number;
  max_attempts: number;
}>;

type ClaimedOperatorLabelEmail = Candidate & Readonly<{
  lease_token_hash: string;
  provider_shipment_reference: string;
  tracking_provider_code: string;
  tracking_reference: string;
  order_number: string;
  total_cents: number;
  currency: "EUR";
  zone: "EU" | "UK" | "US" | "CA" | "GCC";
  customs_status: string | null;
}>;

type PrintableAttachment = Readonly<{
  filename: string;
  bytes: Uint8Array;
  contentSha256: string;
  byteLength: number;
}>;

export type OperatorLabelEmailDispatchReport = Readonly<{
  staleLeasesRecovered: number;
  claimed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  queueDrained: boolean;
}>;

function changed(result: CommerceD1Result<object>): number {
  return Number(result.meta?.changes ?? 0);
}

function addSeconds(now: string, seconds: number): string {
  return new Date(Date.parse(now) + seconds * 1_000).toISOString();
}

async function randomLeaseHash(): Promise<string> {
  return sha256Hex(crypto.randomUUID());
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    const slice = bytes.subarray(offset, Math.min(offset + 32_768, bytes.length));
    let binary = "";
    for (const byte of slice) binary += String.fromCharCode(byte);
    chunks.push(binary);
  }
  return btoa(chunks.join(""));
}

function emailText(row: ClaimedOperatorLabelEmail, attachmentCount: number): string {
  const amount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: row.currency,
  }).format(row.total_cents / 100);
  return [
    "Bonjour Jérémy,",
    "",
    `Les documents d’expédition sont prêts pour la commande ${row.order_number}.`,
    "",
    `Montant payé : ${amount}`,
    `Transporteur : ${row.tracking_provider_code}`,
    `Numéro de suivi : ${row.tracking_reference}`,
    "",
    "L’étiquette transporteur au format A4 est jointe directement à cet e-mail.",
    ...(attachmentCount === 2 ? [
      "Le document douanier A4 nécessaire à cette commande hors Union européenne est également joint.",
    ] : []),
    "Imprime l’étiquette une seule fois, colle-la sur le colis correspondant et remets le colis au transporteur choisi par l’acheteur.",
    ...(attachmentCount === 2 ? [
      "Imprime aussi le document douanier et joins-le au colis selon les consignes du transporteur.",
    ] : []),
    "",
    "En cas de besoin, les mêmes documents restent disponibles dans l’espace Admin :",
    "https://ajluxurystore.com/operations",
    "",
    "Sécurité anti-doublon : le site conserve une seule expédition et une seule étiquette par commande. Un nouveau téléchargement ou un nouvel e-mail ne crée pas un second colis.",
    "",
    "AJ Luxury",
  ].join("\n");
}

async function printableAttachment(
  documents: ShippingDocumentProviderPort,
  row: ClaimedOperatorLabelEmail,
  documentKind: "label" | "customs",
): Promise<PrintableAttachment> {
  const document = await documents.document({
    requestId: row.id,
    providerParcelReference: row.provider_shipment_reference,
    documentKind,
  });
  if (
    document.mediaType !== "application/pdf" ||
    document.byteLength !== document.content.size ||
    document.byteLength < 1 || document.byteLength > 8 * 1024 * 1024 ||
    !/^[0-9a-f]{64}$/.test(document.contentSha256)
  ) throw new TypeError("Operator shipping document proof is invalid.");
  const bytes = new Uint8Array(await document.content.arrayBuffer());
  if (
    bytes.length !== document.byteLength || bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) throw new TypeError("Operator shipping PDF is invalid.");
  return Object.freeze({
    filename: documentKind === "label"
      ? `AJL-${row.order_number}-ETIQUETTE-A4.pdf`
      : `AJL-${row.order_number}-DOUANE-A4.pdf`,
    bytes,
    contentSha256: document.contentSha256,
    byteLength: document.byteLength,
  });
}

export class D1OperatorLabelEmailDispatcher {
  readonly #database: CommerceD1Database;
  readonly #provider: TransactionalEmailProviderPort;
  readonly #documents: ShippingDocumentProviderPort;

  constructor(
    database: CommerceD1Database,
    provider: TransactionalEmailProviderPort,
    documents: ShippingDocumentProviderPort,
  ) {
    this.#database = database;
    this.#provider = provider;
    this.#documents = documents;
  }

  async dispatch(input: Readonly<{
    now: string;
    limit?: number;
  }>): Promise<OperatorLabelEmailDispatchReport> {
    if (!isCanonicalUtcTimestamp(input.now)) {
      throw new TypeError("Operator label email clock is invalid.");
    }
    const limit = input.limit ?? 3;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
      throw new TypeError("Operator label email limit is invalid.");
    }
    const stale = await this.#database.prepare(
      `UPDATE operator_label_email_outbox
      SET status='pending', next_attempt_at=?, lease_token_hash=NULL,
        leased_at=NULL, lease_expires_at=NULL, last_error_code=NULL, updated_at=?
      WHERE status='sending' AND lease_expires_at<=? AND attempts<max_attempts`,
    ).bind(input.now, input.now, input.now).run();
    const candidates = await this.#database.prepare(
      `SELECT id,shipment_id,order_id,recipient_email,attempts,max_attempts
      FROM operator_label_email_outbox
      WHERE status='pending' AND next_attempt_at<=?
      ORDER BY created_at,id LIMIT ?`,
    ).bind(input.now, limit).all<Candidate>();
    const counters = { sent: 0, retryScheduled: 0, failed: 0 };
    for (const candidate of candidates.results) {
      const outcome = await this.#dispatchOne(candidate, input.now);
      counters[outcome] += 1;
    }
    return Object.freeze({
      staleLeasesRecovered: changed(stale),
      claimed: candidates.results.length,
      ...counters,
      queueDrained: candidates.results.length < limit,
    });
  }

  async #dispatchOne(
    candidate: Candidate,
    now: string,
  ): Promise<"sent" | "retryScheduled" | "failed"> {
    if (
      !SAFE_ID.test(candidate.id) || !SAFE_ID.test(candidate.shipment_id) ||
      !SAFE_ID.test(candidate.order_id) || candidate.recipient_email !== RECIPIENT
    ) throw new TypeError("Operator label email candidate is invalid.");
    const leaseTokenHash = await randomLeaseHash();
    const leaseExpiresAt = addSeconds(now, 120);
    const claimed = await this.#database.prepare(
      `UPDATE operator_label_email_outbox
      SET status='sending', attempts=attempts+1, next_attempt_at=NULL,
        lease_token_hash=?, leased_at=?, lease_expires_at=?, updated_at=?
      WHERE id=? AND status='pending' AND next_attempt_at<=?
        AND attempts<max_attempts`,
    ).bind(
      leaseTokenHash, now, leaseExpiresAt, now, candidate.id, now,
    ).run();
    if (changed(claimed) !== 1) return "retryScheduled";
    const row = await this.#database.prepare(
      `SELECT message.id,message.shipment_id,message.order_id,
        message.recipient_email,message.attempts,message.max_attempts,
        message.lease_token_hash,shipment.provider_shipment_reference,
        shipment.tracking_provider_code,shipment.tracking_reference,
        customer_order.order_number,customer_order.total_cents,
        customer_order.currency,configuration.zone,
        customs.status AS customs_status
      FROM operator_label_email_outbox AS message
      INNER JOIN shipments AS shipment ON shipment.id=message.shipment_id
      INNER JOIN orders AS customer_order ON customer_order.id=message.order_id
      INNER JOIN shipping_quotes AS quote ON quote.id=shipment.shipping_quote_id
      INNER JOIN shipping_zone_configurations AS configuration
        ON configuration.id=quote.configuration_id
      LEFT JOIN customs_records AS customs ON customs.shipment_id=shipment.id
      WHERE message.id=? AND message.status='sending'
        AND message.lease_token_hash=? AND shipment.status='label_ready'
        AND customer_order.status='preparing'
        AND (configuration.zone='EU' OR customs.status='ready')`,
    ).bind(candidate.id, leaseTokenHash).first<ClaimedOperatorLabelEmail>();
    if (
      !row || !SAFE_PROVIDER_REFERENCE.test(row.provider_shipment_reference) ||
      !SAFE_ID.test(row.tracking_provider_code) ||
      !SAFE_TRACKING_REFERENCE.test(row.tracking_reference) ||
      !SAFE_ORDER_NUMBER.test(row.order_number) || row.currency !== "EUR" ||
      !["EU", "UK", "US", "CA", "GCC"].includes(row.zone) ||
      (row.zone !== "EU" && row.customs_status !== "ready") ||
      !Number.isSafeInteger(row.total_cents) || row.total_cents <= 0
    ) return this.#retryOrFail(candidate.id, leaseTokenHash, candidate.attempts + 1, now);
    try {
      const documentKinds = row.zone === "EU"
        ? Object.freeze(["label"] as const)
        : Object.freeze(["label", "customs"] as const);
      const attachments = await Promise.all(documentKinds.map((kind) =>
        printableAttachment(this.#documents, row, kind)
      ));
      const totalByteLength = attachments.reduce(
        (total, attachment) => total + attachment.byteLength,
        0,
      );
      const attachmentSha256 = attachments.length === 1
        ? attachments[0].contentSha256
        : await sha256Hex(JSON.stringify(attachments.map((attachment) => [
          attachment.filename,
          attachment.contentSha256,
          attachment.byteLength,
        ])));
      const receipt = await this.#provider.deliver({
        message: Object.freeze({
          id: row.id,
          kind: "operator_label_ready",
          recipientEmail: row.recipient_email,
          locale: "fr",
          payloadJson: JSON.stringify({
            subject: `AJ Luxury — documents A4 prêts — ${row.order_number}`,
            text: emailText(row, attachments.length),
          }),
        }),
        idempotencyKey: `operator_label_ready:${row.shipment_id}`,
        attachments: Object.freeze(attachments.map((attachment) => Object.freeze({
          filename: attachment.filename,
          contentBase64: base64(attachment.bytes),
        }))),
      });
      if (
        receipt.idempotencyKey !== `operator_label_ready:${row.shipment_id}` ||
        !SAFE_PROVIDER_MESSAGE.test(receipt.providerMessageId)
      ) throw new TypeError("Operator label email receipt is invalid.");
      const completed = await this.#database.prepare(
        `UPDATE operator_label_email_outbox
        SET status='sent', lease_token_hash=NULL, leased_at=NULL,
          lease_expires_at=NULL, provider_message_id=?, attachment_sha256=?,
          attachment_byte_length=?, attachment_count=?, sent_at=?, terminal_at=?, updated_at=?
        WHERE id=? AND status='sending' AND lease_token_hash=?`,
      ).bind(
        receipt.providerMessageId, attachmentSha256, totalByteLength, attachments.length,
        now, now, now, row.id, leaseTokenHash,
      ).run();
      if (changed(completed) !== 1) {
        throw new TypeError("Operator label email lease was lost after delivery.");
      }
      return "sent";
    } catch {
      return this.#retryOrFail(row.id, leaseTokenHash, row.attempts, now);
    }
  }

  async #retryOrFail(
    id: string,
    leaseTokenHash: string,
    attempts: number,
    now: string,
  ): Promise<"retryScheduled" | "failed"> {
    const terminal = attempts >= 5;
    const retryAt = terminal
      ? null
      : addSeconds(now, RETRY_SECONDS[Math.min(attempts - 1, RETRY_SECONDS.length - 1)]);
    const result = await this.#database.prepare(
      `UPDATE operator_label_email_outbox
      SET status=?, next_attempt_at=?, lease_token_hash=NULL, leased_at=NULL,
        lease_expires_at=NULL, last_error_code=?, terminal_at=?, updated_at=?
      WHERE id=? AND status='sending' AND lease_token_hash=?`,
    ).bind(
      terminal ? "failed" : "pending",
      retryAt,
      terminal ? "attempts_exhausted" : null,
      terminal ? now : null,
      now,
      id,
      leaseTokenHash,
    ).run();
    if (changed(result) !== 1) throw new TypeError("Operator label email lease was lost.");
    return terminal ? "failed" : "retryScheduled";
  }
}
