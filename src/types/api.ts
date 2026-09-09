/**
 * The server's own types, and a compile-time check that ours agree with them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THESE COME FROM
 * ─────────────────────────────────────────────────────────────────────────
 * `api.generated.ts` is produced from the backend's OpenAPI schema:
 *
 *     npm run types:api          # regenerates both files
 *
 * which runs `manage.py spectacular` against OMS-Backend and pipes the result
 * through `openapi-typescript`. Neither generated file is edited by hand.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT COVERS, AND WHAT IT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────
 * The schema has 281 paths and **65** component schemas. The gap is not an
 * oversight: `drf-spectacular` can only infer a response shape from a
 * `serializer_class`, and 229 of this backend's endpoints are function-based
 * views or bare `APIView`s that build their JSON by hand. Those generate as
 * "unable to guess serializer" and are typed `unknown`.
 *
 * So the generated types cover the ORM-backed masters — parties, products,
 * branches, states, assets, approvals, invoice logs, SKUs — and NOT orders,
 * auth users or the tracker, which are the hand-rolled ones. Adding those means
 * annotating the backend views with `@extend_schema`; until that happens this
 * file is honest about the boundary rather than pretending to cover it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONFORMANCE CHECK IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * Re-exporting server types would let a service keep its own hand-written
 * interface right beside them and drift anyway. `SatisfiedBy` below asserts the
 * direction that actually matters: **can the server's response be assigned to
 * the shape our code expects?** If the server may send `item_name: null` and
 * our interface says `string`, that is a crash waiting on a row where the field
 * happens to be empty — and this file fails to compile instead.
 *
 * The reverse direction is deliberately NOT asserted. Our types are allowed to
 * be narrower (a page that only reads four fields) and to carry client-only
 * additions (`warehouseName`, camelCase mirrors the mobile app sends). Only the
 * promise "every value the server can send fits" is enforced.
 */
import type { components } from "./api.generated";

export type Schemas = components["schemas"];

/* -------------------------------------------------------------------------
 * Server types, named
 * ---------------------------------------------------------------------- */

export type ServerParty = Schemas["Party"];
export type ServerPartyAddress = Schemas["PartyAddress"];
export type ServerProduct = Schemas["Product"];
export type ServerBranch = Schemas["Branch"];
export type ServerState = Schemas["State"];
export type ServerMainGroup = Schemas["MainGroup"];
export type ServerSyncLog = Schemas["SyncLog"];
export type ServerInvoiceLog = Schemas["InvoiceLog"];
export type ServerApprovalWorkflow = Schemas["ApprovalWorkflow"];
export type ServerApprovalLevel = Schemas["ApprovalLevel"];
export type ServerAsset = Schemas["Asset"];
export type ServerSku = Schemas["SKU"];
export type ServerCollectionPerson = Schemas["CollectionPerson"];

/* -------------------------------------------------------------------------
 * The check
 * ---------------------------------------------------------------------- */

/**
 * Fails to compile unless every `Server` value is assignable to `Client`.
 *
 * Written as a conditional type rather than a function so it costs nothing at
 * runtime and reports at the declaration site. The error, when it fires, reads
 * `Type 'ServerX' does not satisfy the constraint …`, and the field it names is
 * the field the backend changed.
 */
export type SatisfiedBy<Client, Server extends Client> = Server;

/**
 * A field the server may omit or null, which our type declares required.
 *
 * Listing them is the alternative to silently widening our interface: each one
 * is a decision about whether the page can cope with the value missing, and
 * naming it here keeps that decision reviewable.
 */
export type OptionalOnServer<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;
