import api from "../apis/api";

export async function createNotification(notification) {
  const { data } = await api.post("/api/notifications", notification);
  return data;
}

export async function listCustomerNotifications(customerId) {
  const { data } = await api.get(`/api/notifications/customer/${encodeURIComponent(customerId)}`);
  return data;
}

export async function markNotificationRead(notificationId) {
  const { data } = await api.patch(`/api/notifications/${encodeURIComponent(notificationId)}/read`);
  return data;
}