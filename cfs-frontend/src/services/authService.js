export { createInternalUser, loginCustomer, registerCustomer } from "../apis/authApi";

const supportedRoles = ["CUSTOMER", "ADMIN", "LOAN_OFFICER", "CREDIT_ANALYST", "CREDIT_MANAGER"];

export function normalizeSession(response) {
  const payload = response?.data || response;
  const user = payload?.user || payload?.customer || payload;
  const token = payload?.token || payload?.accessToken || payload?.jwt;
  const roleValues = user?.roles || user?.role || user?.userRole || payload?.roles || payload?.role || payload?.userRole;
  const role = (Array.isArray(roleValues) ? roleValues : [roleValues])
    .map((value) => {
      const name = typeof value === "string" ? value : value?.authority || value?.name || value?.role;
      return typeof name === "string" ? name.toUpperCase().replace(/^ROLE_/, "") : "";
    })
    .find((name) => supportedRoles.includes(name));

  if (!token || !supportedRoles.includes(role)) {
    throw new Error("The sign-in response did not include a supported role and access token.");
  }

  return {
    token,
    tokenType: payload.tokenType || "Bearer",
    user: {
      id: user?.id || user?.customerId || user?.userId || "",
      name: user?.fullName || user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      email: user?.email || "",
      role,
    },
  };
}