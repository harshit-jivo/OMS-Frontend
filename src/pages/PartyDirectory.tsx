import { useEffect, useMemo, useState } from "react";
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiMagnifyingGlass,
  HiMapPin,
  HiTruck,
  HiUsers,
} from "react-icons/hi2";
import { sapService } from "../services/sapService";
import type { Address, Party } from "../services/sapService";
import "../styles/SapData.css";
import "../styles/PartyDirectory.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Parties & Addresses
 *
 * Parties and addresses were two flat, unrelated lists; they describe one thing.
 * This is a master/detail view: pick a party on the left, and the right pane
 * tabulates every address SAP holds for it — one table per category, and within
 * each table a Billing (address_type "B") block and a Shipping ("S") block,
 * which is exactly how SAP's CRD1 key stores the pair.
 * ────────────────────────────────────────────────────────────────────────── */

const UNCATEGORISED = "Uncategorised";

const isShipping = (address: Address) => String(address.address_type || "").toUpperCase() === "S";

const dash = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);

type CategoryGroup = { category: string; billing: Address[]; shipping: Address[] };

// Group one party's addresses by category, then by bill-to / ship-to.
const groupByCategory = (addresses: Address[]): CategoryGroup[] => {
  const groups = new Map<string, CategoryGroup>();
  for (const address of addresses) {
    const category = String(address.category || "").trim() || UNCATEGORISED;
    let group = groups.get(category);
    if (!group) {
      group = { category, billing: [], shipping: [] };
      groups.set(category, group);
    }
    (isShipping(address) ? group.shipping : group.billing).push(address);
  }
  const sortByName = (a: Address, b: Address) =>
    String(a.address_name || "").localeCompare(String(b.address_name || ""));
  const result = [...groups.values()];
  for (const group of result) {
    group.billing.sort(sortByName);
    group.shipping.sort(sortByName);
  }
  // Real categories first, "Uncategorised" last.
  return result.sort((a, b) => {
    if (a.category === UNCATEGORISED) return 1;
    if (b.category === UNCATEGORISED) return -1;
    return a.category.localeCompare(b.category);
  });
};

export default function PartyDirectory() {
  const [parties, setParties] = useState<Party[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDirectory();
  }, []);

  const loadDirectory = async () => {
    setLoading(true);
    setError("");
    try {
      const [partyData, addressData] = await Promise.all([
        sapService.getParties(),
        sapService.getAddresses(),
      ]);
      setParties(Array.isArray(partyData) ? partyData : []);
      setAddresses(Array.isArray(addressData) ? addressData : []);
    } catch (err) {
      console.log("Error loading party directory:", err);
      setError("Unable to load parties and addresses.");
    } finally {
      setLoading(false);
    }
  };

  // card_code → that party's addresses (card_code is a plain string on both
  // tables; there is no FK, so the join happens here).
  const addressesByCode = useMemo(() => {
    const map = new Map<string, Address[]>();
    for (const address of addresses) {
      const code = String(address.card_code || "");
      if (!code) continue;
      const bucket = map.get(code);
      if (bucket) bucket.push(address);
      else map.set(code, [address]);
    }
    return map;
  }, [addresses]);

  const filteredParties = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return parties;
    return parties.filter((party) =>
      [party.card_code, party.card_name, party.main_group, party.category, party.state]
        .some((field) => String(field || "").toLowerCase().includes(needle)),
    );
  }, [parties, search]);

  // Keep a valid selection: default to the first match, and follow the search
  // when the selected party drops out of the filtered list.
  useEffect(() => {
    if (filteredParties.length === 0) {
      if (selectedCode) setSelectedCode("");
      return;
    }
    const stillVisible = filteredParties.some((party) => party.card_code === selectedCode);
    if (!stillVisible) setSelectedCode(String(filteredParties[0].card_code || ""));
  }, [filteredParties, selectedCode]);

  const selectedParty = useMemo(
    () => parties.find((party) => String(party.card_code || "") === selectedCode) || null,
    [parties, selectedCode],
  );

  const selectedAddresses = selectedCode ? addressesByCode.get(selectedCode) || [] : [];
  const groups = useMemo(() => groupByCategory(selectedAddresses), [selectedAddresses]);
  const billingTotal = addresses.filter((address) => !isShipping(address)).length;
  const selectedBilling = selectedAddresses.filter((address) => !isShipping(address)).length;

  const kpis = [
    { label: "Parties", value: parties.length, icon: HiUsers, tone: "" },
    { label: "Addresses", value: addresses.length, icon: HiMapPin, tone: "" },
    { label: "Billing", value: billingTotal, icon: HiBuildingOffice2, tone: "" },
    { label: "Shipping", value: addresses.length - billingTotal, icon: HiTruck, tone: "sd-kpi-ok" },
  ];

  return (
    <div className="sd-page pd-page">
      <div className="sd-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className={`sd-kpi ${kpi.tone}`} key={kpi.label}>
              <span className="sd-kpi-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="sd-kpi-body">
                <span className="sd-kpi-value">{kpi.value.toLocaleString("en-IN")}</span>
                <span className="sd-kpi-label">{kpi.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="sd-toolbar">
        <div className="sd-search-wrap">
          <HiMagnifyingGlass className="sd-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="sd-search"
            placeholder="Search party by code, name, group, category or state…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button type="button" className="sd-btn" onClick={loadDirectory} disabled={loading}>
          <HiArrowPath className={loading ? "sd-spin" : ""} aria-hidden="true" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="sd-error">{error}</p>}

      {loading && parties.length === 0 ? (
        <p className="sd-loading">Loading parties and addresses…</p>
      ) : (
        <div className="pd-layout">
          {/* ── Master: party selector ── */}
          <aside className="pd-list-panel">
            <div className="pd-list-head">
              Parties
              <span className="pd-list-count">{filteredParties.length.toLocaleString("en-IN")}</span>
            </div>
            {filteredParties.length === 0 ? (
              <p className="sd-empty">No parties match this search.</p>
            ) : (
              <ul className="pd-list">
                {filteredParties.map((party) => {
                  const code = String(party.card_code || "");
                  const count = addressesByCode.get(code)?.length || 0;
                  return (
                    <li key={party.id ?? code}>
                      <button
                        type="button"
                        className={`pd-list-item ${code === selectedCode ? "pd-list-item-active" : ""}`}
                        onClick={() => setSelectedCode(code)}
                      >
                        <span className="pd-item-top">
                          <span className="pd-item-code">{code}</span>
                          <span className={`pd-item-count ${count === 0 ? "pd-item-count-zero" : ""}`}>
                            {count}
                          </span>
                        </span>
                        <span className="pd-item-name">{dash(party.card_name)}</span>
                        <span className="pd-item-meta">
                          {party.category && <span className="sd-badge sd-badge-info">{party.category}</span>}
                          {party.main_group && <span className="sd-badge">{party.main_group}</span>}
                          {party.state && <span className="pd-item-state">{party.state}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ── Detail: the selected party's addresses, tabulated ── */}
          <section className="pd-detail">
            {!selectedParty ? (
              <div className="pd-detail-empty">
                <HiMapPin aria-hidden="true" />
                <p>Select a party to see its billing and shipping addresses.</p>
              </div>
            ) : (
              <>
                <header className="pd-detail-head">
                  <div className="pd-detail-copy">
                    <span className="pd-detail-code">{selectedParty.card_code}</span>
                    <h2 className="pd-detail-name">{dash(selectedParty.card_name)}</h2>
                    <div className="pd-detail-meta">
                      <span>
                        Group: <strong>{dash(selectedParty.main_group)}</strong>
                      </span>
                      <span>
                        Category: <strong>{dash(selectedParty.category)}</strong>
                      </span>
                      <span>
                        State: <strong>{dash(selectedParty.state)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="pd-detail-stats">
                    <div className="pd-stat">
                      <span className="pd-stat-value">{selectedAddresses.length}</span>
                      <span className="pd-stat-label">Addresses</span>
                    </div>
                    <div className="pd-stat pd-stat-billing">
                      <span className="pd-stat-value">{selectedBilling}</span>
                      <span className="pd-stat-label">Billing</span>
                    </div>
                    <div className="pd-stat pd-stat-shipping">
                      <span className="pd-stat-value">{selectedAddresses.length - selectedBilling}</span>
                      <span className="pd-stat-label">Shipping</span>
                    </div>
                  </div>
                </header>

                {groups.length === 0 ? (
                  <div className="pd-detail-empty">
                    <HiMapPin aria-hidden="true" />
                    <p>No addresses are synced for this party yet.</p>
                  </div>
                ) : (
                  groups.map((group) => (
                    <div className="sd-table-card" key={group.category}>
                      <div className="sd-table-head">
                        <h3 className="sd-table-title">{group.category}</h3>
                        <span className="sd-table-note">
                          {group.billing.length} billing · {group.shipping.length} shipping
                        </span>
                      </div>
                      <div className="sd-table-scroll">
                        <table className="sd-table">
                          <thead>
                            <tr>
                              <th>Address Name</th>
                              <th>Full Address</th>
                              <th>City</th>
                              <th>State</th>
                              <th>PIN</th>
                              <th>GST Number</th>
                            </tr>
                          </thead>
                          <AddressRows kind="billing" items={group.billing} />
                          <AddressRows kind="shipping" items={group.shipping} />
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* One address-type block inside a category table: a labelled group header row
 * followed by that type's rows (or an explicit "none" row). */
function AddressRows({ kind, items }: { kind: "billing" | "shipping"; items: Address[] }) {
  const title = kind === "billing" ? "Billing" : "Shipping";
  const Icon = kind === "billing" ? HiBuildingOffice2 : HiTruck;
  return (
    <tbody>
      <tr className={`sd-group-row sd-group-${kind}`}>
        <td colSpan={6}>
          <Icon className="pd-group-icon" aria-hidden="true" />
          {title}
          <span className="sd-group-count">{items.length}</span>
        </td>
      </tr>
      {items.length === 0 ? (
        <tr>
          <td colSpan={6} className="pd-none-row">
            No {title.toLowerCase()} address in this category.
          </td>
        </tr>
      ) : (
        items.map((address) => (
          <tr key={address.id}>
            <td className="sd-strong">{dash(address.address_name)}</td>
            <td className="sd-wrap-cell sd-dim">{dash(address.full_address)}</td>
            <td>{dash(address.city)}</td>
            <td>{dash(address.state)}</td>
            <td className="sd-nowrap">{dash(address.zip_code)}</td>
            <td className="sd-nowrap">{dash(address.gst_number)}</td>
          </tr>
        ))
      )}
    </tbody>
  );
}
