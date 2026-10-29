import api from "../apis/api";

export async function createRepayment(repayment) {
  const { data } = await api.post("/api/repayments", repayment);
  return data;
}

export async function listLoanRepayments(loanId) {
  const { data } = await api.get(`/api/repayments/loan/${encodeURIComponent(loanId)}`);
  return data;
}