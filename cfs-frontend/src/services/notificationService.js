import api from "../apis/api";
import { getFinanceApplication } from "./financeApplicationService";

export async function createNotification(notification) {
  const { data } = await api.post("/api/notifications/internal", notification);
  return data;
}

export async function getNotification(notificationId) {
  const { data } = await api.get(`/api/notifications/${encodeURIComponent(notificationId)}`);
  return data;
}

export async function listCustomerNotifications(customerId) {
  const { data } = await api.get(`/api/notifications/customer/${encodeURIComponent(customerId)}`);
  return data;
}

export async function getCustomerUnreadNotificationCount(customerId) {
  const { data } = await api.get(`/api/notifications/customer/${encodeURIComponent(customerId)}/unread-count`);
  return data;
}

export async function listCustomerNotificationsByType(customerId, type) {
  const { data } = await api.get(`/api/notifications/customer/${encodeURIComponent(customerId)}/type`, {
    params: { type },
  });
  return data;
}

export async function listNotifications() {
  const { data } = await api.get("/api/notifications");
  return data;
}

export async function markNotificationRead(notificationId) {
  const { data } = await api.patch(`/api/notifications/${encodeURIComponent(notificationId)}/read`);
  return data;
}

function rupees(amount) {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0
    ? `Rs. ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";
}

// Looks up the application's customer when the caller does not already know it.
async function resolveCustomerId(customerId, applicationId) {
  if (customerId != null) return Number(customerId);
  if (applicationId == null) return null;
  try {
    return (await getFinanceApplication(applicationId))?.customerId ?? null;
  } catch {
    return null;
  }
}

// Fire-and-forget: a notification failure must never break the main flow.
async function sendNotificationSafely({ customerId, applicationId, ...rest }) {
  try {
    const resolvedCustomerId = await resolveCustomerId(customerId, applicationId);
    if (resolvedCustomerId == null) return null;
    return await createNotification({
      customerId: resolvedCustomerId,
      ...(applicationId != null ? { applicationId: Number(applicationId) } : {}),
      channel: "IN_APP",
      ...rest,
    });
  } catch (error) {
    console.warn("Unable to create notification", error);
    return null;
  }
}

export function notifyApplicationSubmitted({ customerId, applicationId }) {
  return sendNotificationSafely({
    customerId,
    applicationId,
    type: "APPLICATION_SUBMITTED",
    subject: "Loan application submitted",
    message: "Your loan application has been submitted successfully and is awaiting assessment.",
  });
}

export function notifyApplicationDecision({ customerId, applicationId, approvalId, approved }) {
  return sendNotificationSafely({
    customerId,
    applicationId,
    ...(approvalId != null ? { approvalId } : {}),
    type: approved ? "APPLICATION_APPROVED" : "APPLICATION_REJECTED",
    subject: approved ? "Loan application approved" : "Loan application decision",
    message: approved
      ? "Congratulations. Your loan application has been approved."
      : "Your loan application was not approved after assessment and review.",
  });
}

export function notifyLoanDisbursed({ customerId, applicationId, approvalId, disbursementId, amount }) {
  const formatted = rupees(amount);
  return sendNotificationSafely({
    customerId,
    applicationId,
    ...(approvalId != null ? { approvalId } : {}),
    ...(disbursementId != null ? { disbursementId } : {}),
    type: "LOAN_DISBURSED",
    subject: "Loan amount disbursed",
    message: formatted
      ? `Your approved loan amount of ${formatted} has been successfully disbursed.`
      : "Your approved loan amount has been successfully disbursed.",
  });
}

export function notifyRepaymentCreated({ customerId, applicationId, disbursementId, repaymentId, monthlyEmiAmount }) {
  const formatted = rupees(monthlyEmiAmount);
  return sendNotificationSafely({
    customerId,
    applicationId,
    ...(disbursementId != null ? { disbursementId } : {}),
    ...(repaymentId != null ? { repaymentId } : {}),
    type: "REPAYMENT_CREATED",
    subject: "EMI repayment schedule created",
    message: formatted
      ? `Your EMI repayment schedule has been created successfully. Your monthly EMI is ${formatted}.`
      : "Your EMI repayment schedule has been created successfully.",
  });
}

export function notifyEmiPaymentSuccess({ customerId, applicationId, repaymentId, scheduleId, amount }) {
  const formatted = rupees(amount);
  return sendNotificationSafely({
    customerId,
    applicationId,
    ...(repaymentId != null ? { repaymentId } : {}),
    ...(scheduleId != null ? { scheduleId } : {}),
    type: "EMI_PAYMENT_SUCCESS",
    subject: "EMI payment successful",
    message: formatted
      ? `Your EMI payment of ${formatted} was received successfully.`
      : "Your EMI payment was received successfully.",
  });
}
