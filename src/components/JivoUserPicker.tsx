/**
 * Pick a person from Jivo Auth to give an OMS account to.
 *
 * Both user-create forms use this — App Users and the tracker's own users —
 * because both now work the same way: people are created in Jivo Auth by an
 * administrator, and OMS only attaches roles and scope to one of them. So the
 * list offers exactly the people who have OMS access in Jivo Auth and no OMS
 * user yet; picking someone who already has one would only be refused.
 *
 * Name AND email on every row, and both are searched. Names repeat in a
 * company this size; the email is what tells two Amits apart.
 */
import { useMemo } from "react";

import { SearchSelect } from "@/components/ui/dropdown";
import type { JivoUser } from "../services/userService";

/**
 * The people a create form may pick: those without an OMS user yet. Not
 * exported — a component file that also exports a function loses Fast Refresh.
 */
function unlinkedJivoUsers(users: readonly JivoUser[]): JivoUser[] {
  return users.filter((user) => user.oms_user_id === null || user.oms_user_id === undefined);
}

export function JivoUserPicker({
  id,
  users,
  value,
  onChange,
  loading = false,
  disabled = false,
}: {
  id?: string;
  /** Everyone the server listed; the ones already in OMS are left out here. */
  users: readonly JivoUser[];
  /** The chosen `auth_id`, or "" for none. */
  value: string;
  onChange: (authId: string) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const options = useMemo(
    () =>
      unlinkedJivoUsers(users).map((user) => ({
        value: user.auth_id,
        label: user.name || user.email,
        // Said, not hidden: an inactive person can be given an account, but
        // cannot sign in until Jivo Auth switches them back on.
        hint: user.is_active === false ? `${user.email} · inactive in Jivo Auth` : user.email,
      })),
    [users],
  );

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={(next) => onChange(String(next))}
      options={options}
      placeholder={loading ? "Loading people…" : "Select a person"}
      searchPlaceholder="Name or email…"
      emptyText="Everyone with OMS access in Jivo Auth already has an OMS account."
      loading={loading}
      disabled={disabled}
      multiline
    />
  );
}
