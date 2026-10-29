import api from "../apis/api";

export async function listAdminKycRecords() {
  const { data } = await api.get("/api/admin/kyc");
  return data;
}

export async function getAdminKycDetails(customerId) {
  const { data } = await api.get(`/api/admin/kyc/${encodeURIComponent(customerId)}`);
  return data;
}

export async function verifyCustomerKyc(customerId) {
  const { data } = await api.put(`/api/admin/kyc/${encodeURIComponent(customerId)}/verify`, {
    remarks: "Identity and submitted documents verified successfully",
  });
  return data;
}

export async function rejectCustomerKyc(customerId, reason) {
  const { data } = await api.put(`/api/admin/kyc/${encodeURIComponent(customerId)}/reject`, { reason });
  return data;
}