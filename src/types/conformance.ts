/**
 * Compile-time assertions that the client's hand-written response types still
 * describe what the server actually sends.
 *
 * This file exports nothing useful and is never imported at runtime. It exists
 * so that `tsc` fails when the backend changes a serializer — which is the only
 * moment anyone would otherwise find out, several screens later, from a blank
 * cell or a `Cannot read properties of null`.
 *
 * Each block reads: "the server's X must be assignable to our X". Where it is
 * not, the fix goes in the CLIENT type — the server is the source of truth —
 * and the comment records what the difference was.
 */
import type {
  SatisfiedBy,
  ServerBranch,
  ServerParty,
  ServerPartyAddress,
  ServerProduct,
  ServerSyncLog,
} from "./api";
import type { Address, Branch, Log, Party, Product } from "../services/sapService";

/* -------------------------------------------------------------------------
 * SAP masters
 * ---------------------------------------------------------------------- */

/*
 * Product — the one that found a real bug.
 *
 * The serializer allows `item_name` to be null (SAP rows imported without a
 * description) and makes `category` required, while the client had those the
 * other way round. `Product_Stock` and `Products` both render `item_name`
 * straight into a cell, so a null there was `dash(null)` at best and a blank
 * column at worst.
 */
export type _Product = SatisfiedBy<Product, ServerProduct>;

/*
 * Party / PartyAddress — the client calls the second one `Address`, and reads a
 * flat list rather than the nested `addresses` the serializer also returns.
 * Narrower is fine; the assertion only cares that what arrives fits.
 */
export type _Party = SatisfiedBy<Party, ServerParty>;
export type _Address = SatisfiedBy<Address, ServerPartyAddress>;

/*
 * Branch — the server marks `is_active` optional and adds `category` and
 * `created_at`, neither of which the client reads.
 */
export type _Branch = SatisfiedBy<Branch, ServerBranch>;

/*
 * `State` and `MainGroup` have no client-side interface to check: the pages
 * that use them type the value inline as `{ id: number; name: string }`. That
 * is a gap, not a pass — noted rather than papered over.
 */

/*
 * SyncLog — the client type is `Log`. `status` and `sync_type` are enums on the
 * server and free strings on the client, which is the safe direction.
 */
export type _Log = SatisfiedBy<Log, ServerSyncLog>;
