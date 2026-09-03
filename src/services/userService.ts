import api from "./api";

/* ================= TYPES ================= */

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  role_name: string;
  is_active: boolean;
  main_groups?: { id: number; name: string }[];
  states?: { id: number; name: string }[];
  phone?: string;
  company?: number | null;
  category?: CategoryOption | null;
  categories?: CategoryOption[];
  variety?: string | null;
  extra_pages?: string[];
}

export interface Option {
  id: number;
  name: string;
}

export interface CategoryOption {
  id: number;
  category: string;
}

export interface CreateUserData {
  name: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  role: number;
  company?: number | null;
  mainGroup?: number;
  mainGroups?: number[];
  state?: number;
  states?: number[];
  category?: number | null;
  categories?: number[];
  variety?: string | null;
}

export interface BulkPartyUserAssignmentRow {
  user_id?: number | string;
  username?: string;
  user_name?: string;
  name?: string;
  card_code: string;
}

/** A combo pack ("A + B") and the free-of-cost item it carries. */
export interface ComboMapping {
  item_code: string;
  item_name: string;
  category: string;
  sal_factor2: string | number | null;
  party_count: number;
  mapped_party_count: number;
  /** The paid half, before the "+". Set together with `free_item_code`. */
  parent_item_code: string | null;
  parent_item: ComboHalf | null;
  free_item_code: string | null;
  free_qty_per_unit: number | null;
  free_item: ComboHalf | null;
  is_partially_mapped: boolean;
}

/** One resolved side of a combo. `item_name` is null when the code no longer
 *  matches an active SAP product, so the page can show it as broken. */
export interface ComboHalf {
  item_code: string;
  item_name: string | null;
  sal_factor2: string | number | null;
}

export interface ComboMappingPayload {
  item_code: string;
  category: string;
  /** Both halves travel together -- the API rejects a half-filled mapping.
   *  Send both as "" to clear. */
  parent_item_code: string;
  free_item_code: string;
  free_qty_per_unit?: number | null;
}

/* ================= SERVICE ================= */

export const userService = {

  getUsers: async () => {
    const response = await api.get("/auth/users/list/");
    return response.data;
  },

  getMainGroup: async () => {
    const response = await api.get("/auth/mainGroup/");
    return response.data;
  },

  getState: async () => {
    const response = await api.get("/auth/states/");
    return response.data;
  },

  getRole: async () => {
    const response = await api.get("/auth/roles/");
    return response.data;
  },

  getCompany: async () => {
    const response = await api.get("/auth/companies/");
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get("/auth/categories/");
    return response.data;
  },

  getUserParties: async (userId: number, category?: string) => {
    const response = await api.get(`/auth/users/${userId}/parties/`, {
      params: category ? { category } : undefined,
    });
    return response.data;
  },

 assignPartiesToUser: async (userId: number, partyCodes: string[], category?: string) => {
  const payload = {
    user_id: userId,
    card_codes: partyCodes,
    ...(category ? { category } : {}),
  };

  const response = await api.post(`/auth/assign-parties/`, payload);
  return response.data;
},

 bulkAssignPartiesToUsers: async (rows: BulkPartyUserAssignmentRow[]) => {
  const response = await api.post(`/auth/assign-parties/bulk-upload/`, { rows });
  return response.data;
},

 removePartiesToUser: async (userId: number, partyCodes: string) => {
  const payload = {
    user_id: userId,
    card_codes: partyCodes,   
  };

  const response = await api.post(`/auth/remove-party/`, payload);
  return response.data;
},

getPartyProducts: async (card_code: string, category?: string | null) => {
  const response = await api.get(`/auth/parties/${card_code}/products/`, {
    params: category ? { category } : undefined,
  });
  return response.data;
},

removePartyProduct: async (card_code: string, itemCode: string, category: string) => {
   const response = await api.post('/auth/party-product/remove/', {
        card_code: card_code,
        item_code: itemCode,
        category:  category
      });

        return response.data; },

  bulkAssignPartiesToUser: async (
    card_code: string,
    payload: Array<{ item_code: string; category?: string; basic_rate?: number | string }>,
  ) => {
    const response = await api.post(`/auth/party-product/bulk-add/`, {
      card_codes: card_code,   
      products : payload
    });
    return response.data;
  },
  

  editRate: async (card_code: string, item_code: string, category: string, new_rate: number) => {
    const response = await api.post('/auth/party-product/update-rate/', {
      card_code, item_code, category, basic_rate: new_rate
    });
    return response.data;
  },

  createUser: async (data: CreateUserData) => {
    const payload = {
      name: data.name,
      username: data.username,
      password: data.password,
      email: data.email,
      phone: data.phone,
      role: data.role || null,
      company: data.company || null,
      main_group: data.mainGroup || null,
      main_groups: data.mainGroups || [],
      state: data.state || null,
      states: data.states || [],
      category: data.category || (data.categories && data.categories[0]) || null,
      categories: data.categories || [],
      sub_group: data.variety || null
    };

    const response = await api.post("/auth/users/create/", payload);

    return response.data;
  },

updateUser: async (id: number, data: CreateUserData) => {
  const mainGroups = data.mainGroups || [];
  const states = data.states || [];

  // The edit form has a single Category select, so `category` is the source of
  // truth and `categories` is derived from it. Sending a bare `categories: []`
  // (which is what happened while the form never filled `categories`) made the
  // backend clear the m2m AND null the `category` FK on every save.
  const category = data.category ?? data.categories?.[0] ?? null;
  const categories = data.categories?.length
    ? data.categories
    : category
      ? [category]
      : [];

  const payload = {
    name: data.name,
    username: data.username,
    password: data.password || undefined,
    email: data.email,
    phone: data.phone,
    role: data.role || null,
    company: data.company || null,
    main_group: mainGroups[0] || data.mainGroup || null,
    main_groups: mainGroups,
    state: states[0] || data.state || null,
    states: states,
    category,
    categories,
    sub_group: data.variety || null,
  };

  const response = await api.put(`/auth/users/${id}/`, payload);
  return response.data;
},

  // --- Role Permissions matrix (Phase 4) ---------------------------------
  // The registry is the server's catalogue of grantable keys; the roles call
  // returns every role with its bundle. Both are admin-only server-side.
  getPermissionRegistry: async () => {
    const response = await api.get(`/auth/permission-registry/`);
    return response.data as {
      success: boolean;
      data: { modules: { name: string; keys: { key: string; label: string }[] }[] };
    };
  },

  getRolePermissions: async () => {
    const response = await api.get(`/auth/roles/permissions/`);
    return response.data as {
      success: boolean;
      data: {
        migrated: boolean;
        roles: {
          id: number;
          name: string;
          display_name: string;
          is_active: boolean;
          keys: string[];
          /** Distinct holders (primary or extra) — a held role cannot be deleted. */
          users: number;
        }[];
      };
    };
  },

  updateRolePermissions: async (roleId: number, keys: string[]) => {
    const response = await api.put(`/auth/roles/${roleId}/permissions/`, { keys });
    return response.data as { success: boolean; message: string };
  },

  // Role lifecycle. `name` is immutable server-side (parts of the system
  // still match roles by name); display_name is the safe rename.
  createRole: async (name: string, displayName: string) => {
    const response = await api.post(`/auth/roles/create/`, {
      name,
      display_name: displayName,
    });
    return response.data as {
      success: boolean;
      message: string;
      data: { id: number; name: string; display_name: string; is_active: boolean };
    };
  },

  updateRole: async (
    roleId: number,
    patch: { display_name?: string; is_active?: boolean },
  ) => {
    const response = await api.put(`/auth/roles/${roleId}/update/`, patch);
    return response.data as {
      success: boolean;
      message: string;
      data: { id: number; name: string; display_name: string; is_active: boolean };
    };
  },

  deleteRole: async (roleId: number) => {
    const response = await api.delete(`/auth/roles/${roleId}/delete/`);
    return response.data as { success: boolean; message: string };
  },

  getPagePermissions: async (userId: number) => {
    const response = await api.get(`/auth/users/${userId}/page-permissions/`);
    return response.data;
  },

  updatePagePermissions: async (userId: number, extraPages: string[]) => {
    const response = await api.put(`/auth/users/${userId}/page-permissions/`, {
      extra_pages: extraPages,
    });
    return response.data;
  },

  /* ---- Combo pack -> free item mapping ---- */

  getComboMappings: async () => {
    const response = await api.get("/auth/combo-mappings/");
    return (response.data?.data?.combos || []) as ComboMapping[];
  },

  saveComboMapping: async (payload: ComboMappingPayload) => {
    const response = await api.post("/auth/combo-mappings/", payload);
    return response.data;
  },

};
