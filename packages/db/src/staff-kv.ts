import type { StaffRole, StaffUser } from "@pathminty/contracts";

import { hashPassword, verifyPassword } from "./passwords";

type Store = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: Array<{ name: string }> }>;
};

type StoredStaff = StaffUser & { passwordHash: string };

function userKey(email: string) {
  return `staff:user:${email.toLowerCase()}`;
}

function sessionKey(id: string) {
  return `staff:session:${id}`;
}

export async function listStaffFromKv(store: Store): Promise<StaffUser[]> {
  const listed = await store.list({ prefix: "staff:user:" });
  const users: StaffUser[] = [];
  for (const key of listed.keys) {
    const stored = await store.get(key.name, "json");
    if (!stored || typeof stored !== "object") continue;
    const row = stored as StoredStaff;
    if (typeof row.email === "string" && typeof row.role === "string") {
      users.push({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
      });
    }
  }
  return users.sort((left, right) => left.email.localeCompare(right.email));
}

export async function upsertStaffInKv(
  store: Store,
  input: {
    email: string;
    name: string;
    role: StaffRole;
    password: string;
    active?: boolean;
  },
): Promise<StaffUser> {
  const email = input.email.toLowerCase();
  const existing = (await store.get(userKey(email), "json")) as StoredStaff | null;
  const user: StoredStaff = {
    id: existing?.id ?? crypto.randomUUID(),
    email,
    name: input.name,
    role: input.role,
    active: input.active ?? true,
    passwordHash: await hashPassword(input.password),
  };
  await store.put(userKey(email), JSON.stringify(user));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

export async function authenticateStaff(
  store: Store,
  email: string,
  password: string,
): Promise<StaffUser | null> {
  const stored = (await store.get(userKey(email), "json")) as StoredStaff | null;
  if (!stored?.active || !stored.passwordHash) return null;
  const ok = await verifyPassword(password, stored.passwordHash);
  if (!ok) return null;
  return {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    role: stored.role,
    active: stored.active,
  };
}

export async function createStaffSession(
  store: Store,
  staff: StaffUser,
): Promise<string> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await store.put(
    sessionKey(id),
    JSON.stringify({
      staffId: staff.id,
      email: staff.email,
      role: staff.role,
      name: staff.name,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1_000).toISOString(),
    }),
    { expirationTtl: 12 * 60 * 60 },
  );
  return id;
}

export async function deleteStaffSession(store: Store, id: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/u.test(id)) return;
  await store.delete(sessionKey(id));
}

export async function readStaffSession(
  store: Store,
  id: string,
): Promise<StaffUser | null> {
  if (!/^[a-f0-9]{64}$/u.test(id)) return null;
  const stored = await store.get(sessionKey(id), "json");
  if (!stored || typeof stored !== "object") return null;
  const row = stored as {
    email?: string;
    role?: StaffRole;
    name?: string;
    staffId?: string;
    expiresAt?: string;
  };
  if (!row.email || !row.role || !row.staffId) return null;
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return null;
  return {
    id: row.staffId,
    email: row.email,
    name: row.name ?? row.email,
    role: row.role,
    active: true,
  };
}

export async function ensureBootstrapStaff(
  store: Store,
  email: string | undefined,
  password: string | undefined,
): Promise<void> {
  if (!email || !password) return;
  const existing = await store.get(userKey(email), "json");
  if (existing) return;
  await upsertStaffInKv(store, {
    email,
    name: "Founder",
    role: "admin",
    password,
  });
}
