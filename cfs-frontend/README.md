# React + Vite

## Approval API

The approval service uses the shared authenticated API client and returns response data.

| Function | Endpoint | Roles |
| --- | --- | --- |
| `createApproval(approval)` | `POST /api/approvals` | CREDIT_MANAGER / ADMIN |
| `listApprovals()` | `GET /api/approvals` | CREDIT_MANAGER / ADMIN |
| `getApproval(approvalId)` | `GET /api/approvals/{approvalId}` | CREDIT_MANAGER / ADMIN |
| `getApprovalForApplication(applicationId)` | `GET /api/approvals/application/{applicationId}` | CREDIT_MANAGER / ADMIN |
| `listApprovalsByStatus("APPROVED")` | `GET /api/approvals/status/APPROVED` | CREDIT_MANAGER / ADMIN |
| `listApprovalsByStatus("REJECTED")` | `GET /api/approvals/status/REJECTED` | CREDIT_MANAGER / ADMIN |
| `listApprovalsByReviewer(email)` | `GET /api/approvals/reviewer?reviewedBy={email}` | ADMIN |

`createApproval` forwards the supplied decision payload unchanged. Reviewer email is passed as an Axios query parameter for safe encoding. The backend enforces role permissions; these service functions do not add or change UI access.

Approval requests use this contract:

```json
{
  "applicationId": 2,
  "creditAssessmentId": 2,
  "status": "REJECTED",
  "remarks": "Customer does not meet the required credit conditions"
}
```

`status` is `APPROVED` or `REJECTED`. The review form sends the entered remarks for either status and requires a reason for rejection. It uses the application's `creditAssessmentId` when available; otherwise it retrieves the assessment using `GET /api/credit-assessments/application/{applicationId}` and reads its `creditAssessmentId`. A missing assessment or failed lookup displays an error without posting a decision.

The **Approvals** sidebar tab at `/admin/approvals` is available only to ADMIN and CREDIT_MANAGER. It lists all decisions, supports approved/rejected filters and lookups by approval or application ID, and provides a decision form with explicit application and credit assessment IDs. Only ADMIN sees the reviewer-email search. Submission uses numeric IDs and refreshes the current history query after success. Other roles cannot render the approval workspace, including through a direct URL.

The tab opens with the approval history table. Select a row or its **Details** button to load the full decision in a right-side overlay, including remarks and credit assessment ID. **Record decision** opens the creation form in the same drawer style, keeping the list as the primary view. Details drawers support Escape, backdrop dismissal, keyboard focus trapping, and focus restoration.

## Finance Application Screens

- `/admin/loan-products`: list active products, create a product, and retrieve a product by ID.
- `/customer/loan-products`: list active products and view product details.
- `/customer/apply`: select a product, inspect its details, save a draft, or create and submit an application.
- `/customer/applications`: list the signed-in customer's applications, view application details and status history, and submit an existing draft.
- `/admin/applications`: retrieve an application by ID or list applications by customer ID, then view details and history. No admin-wide listing endpoint was supplied.

All eight documented finance service endpoints are connected to these screens. Product creation is shown only to administrators; API authorization and submission eligibility remain backend responsibilities. A failed submission after successful creation preserves the saved draft and directs the customer to retry from their application list.

### Product Creation Contract

The creation form posts `productCode`, `productName`, `minimumAmount`, `maximumAmount`, `minimumTenureMonths`, `maximumTenureMonths`, `minimumInterestRate`, `maximumInterestRate`, and `active` to `/api/loan-products`. Numeric inputs are sent as numbers; `active` is a boolean. Description is not part of this request. Maximum values must not be lower than minimum values, and tenure must be a whole number of months. The list displays the minimum-to-maximum annual interest-rate range.

Product responses are expected to identify records with `productId`; applications use `applicationId`. Lists accept arrays or common envelopes such as `content` and `data`. Submission uses the existing application ID and does not create another draft.

Development API requests proxy to `VITE_API_BASE_URL`, defaulting to `http://localhost:8080`. Run `npm run dev` for a local preview, `npm run lint` for static validation, and `npm run build` for a production build. Browser workflows and live backend compatibility still require runtime verification.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
