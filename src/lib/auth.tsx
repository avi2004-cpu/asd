import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { pb, currentUser, homeFor } from "./pb";
import type { Role, User } from "../types/schema";

/** Re-renders whenever the PocketBase auth store changes (login / logout). */
export function useAuth(): User | null {
  const [user, setUser] = useState<User | null>(currentUser);
  useEffect(() => pb.authStore.onChange(() => setUser(currentUser())), []);
  return user;
}

export function logout(): void {
  pb.authStore.clear();
}

/** Route guard: must be logged in, and (optionally) have the given role. */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const user = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
