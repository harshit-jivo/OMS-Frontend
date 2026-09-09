/**
 * The `/auth/` reference lookups, shared by key.
 *
 * These are the lists that populate every dropdown in the app — users, main
 * groups, states, roles, companies, categories. None of them changes during a
 * session, and before this file each page fetched the ones it needed on mount
 * with its own `useState` + `useEffect` + try/catch. The state list alone had
 * three copies; the user list had six.
 *
 * SHARING THE KEY IS THE POINT, not sharing the code. `["users"]` now reaches
 * Daily_Report, PersonWise_Report, Sales_Report, App_User, Party_Assignment and
 * Page_Permissions — six pages, several of which sit next to each other in the
 * menu, all of which used to re-download the same list on every visit.
 *
 * WHY THE UNWRAPPING LIVES HERE
 * -----------------------------
 * `userService` returns `response.data` untyped for all of these, and the six
 * consumers disagreed about the shape. The user list was read three different
 * ways in three files — `data.data` unguarded (App_User), `data.data.filter()`
 * (Party_Assignment), and the tolerant `Array.isArray(r) ? r : r?.data ?? []`
 * (Page_Permissions). Two of those three crash on a shape they do not expect.
 * The tolerant one is the version that survived, and it is now the only one.
 */
import { useQuery } from "@tanstack/react-query";

import { userService } from "../services/userService";
import type { CategoryOption, Option, User } from "../services/userService";

/**
 * Stable empties, so a page with no data yet does not hand its `useMemo`s a new
 * array identity on every render — which is what makes them recompute forever.
 */
const NO_USERS: User[] = [];
const NO_OPTIONS: Option[] = [];
const NO_CATEGORIES: CategoryOption[] = [];
const NO_STATES: StateOption[] = [];

/** A state as `/auth/states/` returns it. */
export type StateOption = {
  id: number;
  name: string;
  code: string;
};

/**
 * Accept a bare array or a `{data: [...]}` envelope, and nothing else.
 *
 * Not cosmetic: `/auth/users/list/` is the one enveloped endpoint among these
 * (see the note in e2e/fixtures.ts about wrapping them uniformly breaking two
 * pages), and the pages that assumed the envelope threw `X.filter is not a
 * function` whenever it was absent.
 */
const asList = <T>(body: unknown, empty: T[]): T[] => {
  if (Array.isArray(body)) return body as T[];
  const inner = (body as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(inner) ? (inner as T[]) : empty;
};

/** What every one of these lookups returns, in the same shape. */
type Lookup<T> = {
  items: T[];
  isLoading: boolean;
  isError: boolean;
};

export function useUserList(): Lookup<User> & { users: User[] } {
  const { data, isPending, isError } = useQuery({
    queryKey: ["users"],
    queryFn: async () => asList<User>(await userService.getUsers(), NO_USERS),
  });
  const users = data ?? NO_USERS;
  // `users` and `items` are the same array; `users` reads better at the three
  // report call sites, `items` keeps the shape uniform with the rest.
  return { users, items: users, isLoading: isPending, isError };
}

export function useMainGroups(): Lookup<Option> {
  const { data, isPending, isError } = useQuery({
    queryKey: ["main-groups"],
    queryFn: async () => asList<Option>(await userService.getMainGroup(), NO_OPTIONS),
  });
  return { items: data ?? NO_OPTIONS, isLoading: isPending, isError };
}

export function useStates(): Lookup<StateOption> & { states: StateOption[] } {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth", "states"],
    queryFn: async () => asList<StateOption>(await userService.getState(), NO_STATES),
  });
  const states = data ?? NO_STATES;
  return { states, items: states, isLoading: isPending, isError };
}

export function useRoles(): Lookup<Option> {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth", "roles"],
    queryFn: async () => asList<Option>(await userService.getRole(), NO_OPTIONS),
  });
  return { items: data ?? NO_OPTIONS, isLoading: isPending, isError };
}

export function useCompanies(): Lookup<Option> {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth", "companies"],
    queryFn: async () => asList<Option>(await userService.getCompany(), NO_OPTIONS),
  });
  return { items: data ?? NO_OPTIONS, isLoading: isPending, isError };
}

export function useCategories(): Lookup<CategoryOption> {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth", "categories"],
    queryFn: async () => asList<CategoryOption>(await userService.getCategories(), NO_CATEGORIES),
  });
  return { items: data ?? NO_CATEGORIES, isLoading: isPending, isError };
}
