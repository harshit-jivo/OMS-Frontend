/**
 * State and mutations behind the Masters tab: collection persons.
 *
 * Company mappings lived here too, until the SAP company database moved to
 * environment configuration and the cash G/L into the payment-method mapping.
 * Both the table and its CRUD endpoints are gone, so the queries, mutations
 * and the EMPTY_MAPPING default (which hardcoded "OIL") went with them.
 * Payment method mapping is ConfigTab.tsx, embedded by the component.
 *
 * Phase 3.1: `companies` and `persons` were `useResource` fetch/effects; they
 * are now `useQuery`. The six writes (save/toggle/delete for each of the two
 * lists) were `try/catch` around a direct `approvalService` call sharing one
 * `busy` boolean — the company-mapping toggle was an inline handler written
 * straight into the JSX rather than a named function. All six are now
 * `useMutation`s, and `busy` is the six `isPending`s OR'd together — the
 * same "any in-flight write disables every button" behaviour the one
 * boolean gave.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import approvalService, {
  type Company,
  type CollectionPerson,
  type CollectionPersonPayload,
} from "../../../services/approvalService";
import { messageFrom } from "../useApprovalAdmin";
import type { Flash, Resource } from "./types";

export const EMPTY_PERSON: CollectionPersonPayload = {
  name: "",
  // Blank = selectable in every company; the dialog explains this.
  company: "",
  phone: "",
  // Left blank so the server generates it from the name.
  code: "",
  is_active: true,
};

const NO_PERSONS: CollectionPerson[] = [];

export function useMastersTab(flash: Flash) {
  // Company filter for the persons list. Declared before the query so it can
  // be passed as a query-key dependency.
  const [personCompany, setPersonCompany] = useState<Company | "">("");

  // The ADMIN endpoint, not the picker feed — it returns inactive rows too,
  // so a deactivated person can be seen and switched back on.
  const personsQuery = useQuery({
    queryKey: ["approvals", "collection-persons", personCompany],
    queryFn: () => approvalService.adminListCollectionPersons(personCompany || undefined),
  });
  const persons: Resource<CollectionPerson[]> = {
    data: personsQuery.data ?? NO_PERSONS,
    loading: personsQuery.isFetching,
    error: personsQuery.error
      ? messageFrom(personsQuery.error, "Failed to load")
      : "",
    reload: () => void personsQuery.refetch(),
  };

  const [editingPerson, setEditingPerson] = useState<
    (CollectionPersonPayload & { id?: number }) | null
  >(null);
  const [deletingPerson, setDeletingPerson] = useState<CollectionPerson | null>(
    null,
  );

  // ---- Collection persons ----------------------------------------------
  const personValid = !!editingPerson?.name?.trim();

  const savePersonMutation = useMutation({
    mutationFn: (payload: CollectionPersonPayload & { id?: number }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        return approvalService.updateCollectionPerson(id, rest);
      }
      return approvalService.createCollectionPerson(payload);
    },
    onSuccess: (_person, payload) => {
      flash(payload.id ? "Person updated" : "Person created");
      setEditingPerson(null);
      persons.reload();
    },
    onError: (err) => flash(messageFrom(err, "Save failed"), "err"),
  });

  const togglePersonMutation = useMutation({
    mutationFn: (person: CollectionPerson) =>
      approvalService.updateCollectionPerson(person.id, {
        is_active: !person.is_active,
      }),
    onSuccess: (_person, person) => {
      flash(person.is_active ? "Deactivated" : "Activated");
      persons.reload();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const deletePersonMutation = useMutation({
    mutationFn: (person: CollectionPerson) =>
      approvalService.deleteCollectionPerson(person.id),
    onSuccess: () => {
      flash("Person deleted");
      setDeletingPerson(null);
      persons.reload();
    },
    onError: (err) => flash(messageFrom(err, "Delete failed"), "err"),
  });

  const busy =
    savePersonMutation.isPending ||
    togglePersonMutation.isPending ||
    deletePersonMutation.isPending;

  return {
    personCompany,
    setPersonCompany,
    persons,
    editingPerson,
    setEditingPerson,
    deletingPerson,
    setDeletingPerson,
    busy,
    personValid,
    savePerson: () => editingPerson && savePersonMutation.mutate(editingPerson),
    togglePerson: (person: CollectionPerson) => togglePersonMutation.mutate(person),
    confirmDeletePerson: () =>
      deletingPerson && deletePersonMutation.mutate(deletingPerson),
  };
}
