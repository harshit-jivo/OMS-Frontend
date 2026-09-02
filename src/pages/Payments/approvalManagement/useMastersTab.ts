/**
 * State and mutations behind the Masters tab: company mappings and
 * collection persons. (Payment method mapping is ConfigTab.tsx, embedded by
 * the component and untouched by this split.)
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
  type CompanyMapping,
  type CompanyMappingPayload,
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

export const EMPTY_MAPPING: CompanyMappingPayload = {
  company: "OIL",
  display_name: "",
  company_db: "",
  hana_schema: "",
  default_bpl_id: null,
  cash_gl_account: "",
  deposit_source_gl_account: "",
  is_active: true,
};

const NO_MAPPINGS: CompanyMapping[] = [];
const NO_PERSONS: CollectionPerson[] = [];

export function useMastersTab(flash: Flash) {
  // Company filter for the persons list. Declared before the query so it can
  // be passed as a query-key dependency.
  const [personCompany, setPersonCompany] = useState<Company | "">("");

  const companiesQuery = useQuery({
    queryKey: ["approvals", "company-mappings"],
    queryFn: () => approvalService.listCompanyMappings(),
  });
  const companies: Resource<CompanyMapping[]> = {
    data: companiesQuery.data ?? NO_MAPPINGS,
    loading: companiesQuery.isFetching,
    error: companiesQuery.error
      ? messageFrom(companiesQuery.error, "Failed to load")
      : "",
    reload: () => void companiesQuery.refetch(),
  };

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

  const [editing, setEditing] = useState<
    (CompanyMappingPayload & { id?: number }) | null
  >(null);
  const [deleting, setDeleting] = useState<CompanyMapping | null>(null);
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

  // ---- Company mappings --------------------------------------------------
  const saveMappingMutation = useMutation({
    mutationFn: (payload: CompanyMappingPayload & { id?: number }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        return approvalService.updateCompanyMapping(id, rest);
      }
      return approvalService.createCompanyMapping(payload);
    },
    onSuccess: (_mapping, payload) => {
      flash(payload.id ? "Mapping updated" : "Mapping created");
      setEditing(null);
      companies.reload();
    },
    onError: (err) => flash(messageFrom(err, "Save failed"), "err"),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (mapping: CompanyMapping) =>
      approvalService.deleteCompanyMapping(mapping.id),
    onSuccess: () => {
      flash("Mapping deleted");
      setDeleting(null);
      companies.reload();
    },
    onError: (err) => flash(messageFrom(err, "Delete failed"), "err"),
  });

  const toggleMappingMutation = useMutation({
    mutationFn: (mapping: CompanyMapping) =>
      approvalService.updateCompanyMapping(mapping.id, {
        is_active: !mapping.is_active,
      }),
    onSuccess: (_mapping, mapping) => {
      flash(mapping.is_active ? "Deactivated" : "Activated");
      companies.reload();
    },
    onError: (err) => flash(messageFrom(err, "Update failed"), "err"),
  });

  const busy =
    savePersonMutation.isPending ||
    togglePersonMutation.isPending ||
    deletePersonMutation.isPending ||
    saveMappingMutation.isPending ||
    deleteMappingMutation.isPending ||
    toggleMappingMutation.isPending;

  const mappingValid =
    !!editing?.company &&
    !!editing?.display_name?.trim() &&
    !!editing?.company_db?.trim() &&
    !!editing?.hana_schema?.trim();

  return {
    personCompany,
    setPersonCompany,
    companies,
    persons,
    editing,
    setEditing,
    deleting,
    setDeleting,
    editingPerson,
    setEditingPerson,
    deletingPerson,
    setDeletingPerson,
    busy,
    personValid,
    mappingValid,
    savePerson: () => editingPerson && savePersonMutation.mutate(editingPerson),
    togglePerson: (person: CollectionPerson) => togglePersonMutation.mutate(person),
    confirmDeletePerson: () =>
      deletingPerson && deletePersonMutation.mutate(deletingPerson),
    saveMapping: () => editing && saveMappingMutation.mutate(editing),
    confirmDeleteMapping: () => deleting && deleteMappingMutation.mutate(deleting),
    toggleMapping: (mapping: CompanyMapping) => toggleMappingMutation.mutate(mapping),
  };
}
