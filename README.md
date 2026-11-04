# 💻 Consumer Finance System - Frontend

A **React + Vite frontend** for the Consumer Finance System microservices platform.

The application provides role-based workflows for customers and internal staff and communicates with the backend through the Spring Cloud API Gateway.

---

## 🚀 Tech Stack

```
React
Vite
JavaScript
CSS
Axios
JWT Authentication
Role-Based Routing
REST API Integration
```

---

## 🏗️ Frontend Architecture

                    🌐 Browser
                        │
                        ▼
                 React + Vite
                localhost:5173
                        │
                        │ Axios
                        │ REST / JSON
                        │ Bearer JWT
                        ▼
                🚪 API Gateway
                localhost:8080
                        │
                        ▼
              Spring Boot Microservices
```

The frontend never connects directly to MySQL databases.

All business data is retrieved through backend REST APIs.

---

## 🔄 Complete Business Flow

```
Customer Registration
        ↓
Login
        ↓
Customer Profile
        ↓
KYC
        ↓
Loan Application
        ↓
Credit Assessment
        ↓
Approval
        ↓
Disbursement
        ↓
Admin EMI Management
        ↓
EMI Schedule
        ↓
Repayment
        ↓
Notifications
```

---

# 👥 Supported Roles

```
👤 CUSTOMER

🛡️ ADMIN

📊 CREDIT_ANALYST

✅ CREDIT_MANAGER

🏦 LOAN_OFFICER
```

---

# 👤 Customer Features

Customer navigation includes:

```
Overview
My Profile
Apply for Finance
Loan Products
My Applications
EMI Schedule
Repayment History
Notifications
```

Customers can:

- Create and manage customer profile
- Complete onboarding
- Submit KYC
- Browse loan products
- Create finance applications
- Submit applications
- View application history
- View loan accounts
- View EMI schedule
- View installment details
- Perform simulated repayments
- View repayment history
- View notifications
- Mark notifications as read

---

# 📊 Customer Dashboard

The Customer Overview uses real backend data to display:

```
Active Applications

Approved Finance

Outstanding Balance

Next EMI

Next Due Date
```

Financial values are loaded from the actual loan account and EMI schedule.

---

# 🛡️ Admin Features

Admin navigation includes:

```
Overview
Loan Products
Applications
Customers
KYC Review
Internal Users
Credit Assessments
Approvals
Disbursements
EMI Management
Notifications
```

Admin can:

- Review customer KYC
- Verify/reject KYC
- Create internal users
- Create loan products
- View submitted applications
- View credit assessments
- View approval records
- Create disbursements
- Search disbursements
- Generate EMI schedules
- Search existing EMI schedules
- View loan accounts
- View EMI installments
- Create internal notifications

---

# 🧮 Admin EMI Management

After a loan is disbursed:

```
APPROVED
    ↓
DISBURSED
    ↓
Admin EMI Management
    ↓
Loan Account
    ↓
EMI Installments
```

Admin can search using:

```
Application ID
```

The frontend retrieves the existing disbursement and can prefill:

```
Disbursement ID
Principal Amount
```

Admin then provides required schedule information such as:

```
Customer ID
Annual Interest Rate
Tenure
First Due Date
```

The backend generates the actual EMI schedule.

The frontend does not calculate EMI values.

---

# 📊 Credit Analyst Features

Credit Analyst navigation:

```
Overview
Applications
Credit Assessments
Approvals
```

Credit Analyst can:

- View submitted applications
- Open assessment context
- View existing assessments
- Create assessments
- Mark assessment as `ELIGIBLE`
- Mark assessment as `NOT_ELIGIBLE`
- Provide assessment reason
- View approval history

Approval history is read-only for Credit Analyst.

---

# ✅ Credit Manager Features

Credit Manager navigation:

```
Overview
Applications
Credit Assessments
Decision Queue
Approvals
Disbursements
```

Credit Manager can:

- View submitted applications
- View assessments
- View pending approval decisions
- Approve applications
- Reject applications
- View approval history
- Create disbursements
- Search disbursement details

---

# 🏦 Loan Officer

The Loan Officer role is supported by authentication.

The current capstone does not implement a dedicated operational Loan Officer workflow.

The UI therefore exposes only functionality authorized by the backend rather than showing unsupported placeholder pages.

---

# 🔐 Authentication Flow

```
User
 ↓
Login Form
 ↓
POST /api/auth/login
 ↓
Authentication Service
 ↓
JWT Returned
 ↓
React Session
 ↓
Axios
 ↓
Authorization: Bearer <JWT>
 ↓
API Gateway
 ↓
Protected Microservice
```

The frontend uses role information for navigation.

Backend Spring Security remains the authoritative security layer.

---

# 🌐 Backend Integration

Frontend:

```
http://localhost:5173
```

API Gateway:

```
http://localhost:8080
```

Major API groups:

```
/api/auth/**
/api/customers/**
/api/admin/kyc/**
/api/loan-products/**
/api/applications/**
/api/credit-assessments/**
/api/approvals/**
/api/disbursements/**
/api/emi/**
/api/notifications/**
```

---

# 💰 EMI and Repayment

Customers can view:

```
Loan Account Status
Principal
Interest Rate
Tenure
Monthly EMI
Outstanding Balance
```

Installment details include:

```
Installment Number
Due Date
Opening Principal
Principal Component
Interest Component
EMI Amount
Amount Paid
Status
```

Current payment mode:

```
SIMULATED
```

The backend performs the actual financial calculations.

---

# 🔔 Notifications

Customers can:

```
View Notifications
View Unread Count
Mark Notification as READ
```

Admin can create internal notification records.

Supported channels include:

```
IN_APP
EMAIL
SMS
```

External Email/SMS provider delivery is not implemented in the current capstone.

---

# ⚠️ Error Handling

The frontend handles common backend responses such as:

```
400 → Validation Error

401 → Authentication / Session Error

403 → Permission Denied

404 → Resource Not Found

409 → Duplicate / Workflow Conflict

502 → Downstream Failure

503 → Service Temporarily Unavailable
```

Raw backend stack traces are not displayed in the UI.

---

# 💰 Currency Formatting

Financial values are displayed using INR formatting.

Examples:

```
₹50,000.00

₹48,481.72

₹4,407.43

₹25,00,000.00
```

React displays backend-calculated values rather than performing authoritative financial calculations.

---

# 🧪 Verification

The final frontend has been verified using:

```
✅ npm run lint

✅ npm run build

✅ Customer browser testing

✅ Admin browser testing

✅ Credit Analyst browser testing

✅ Credit Manager browser testing

✅ Loan Officer authentication testing

✅ Backend integration testing
```

---

# 🚀 Local Setup

## Requirements

```
Node.js
npm
Git
```

The backend must also be running.

---

## Install Dependencies

From the Vite application folder:

```bash
npm install
```

or for a lock-file based clean installation:

```bash
npm ci
```

---

## Start Development Server

```bash
npm run dev
```

Normally available at:

```
http://localhost:5173
```

---

## Run ESLint

```bash
npm run lint
```

---

## Production Build

```bash
npm run build
```

---

# 🌐 Multiple Role Testing

Normal browser tabs may share local storage.

For simultaneous role testing, use different browser profiles.

Example:

```
Edge Normal       → CUSTOMER

Edge InPrivate    → CREDIT_ANALYST

Chrome Normal     → CREDIT_MANAGER

Chrome Incognito  → ADMIN
```

All sessions can connect to:

```
http://localhost:5173
```

while keeping separate JWT sessions.

---

# 🔗 Compatible Backend

This frontend is designed for the Consumer Finance System backend.

Recommended backend branch:

```
feature/java-modernization
```

Backend Gateway:

```
http://localhost:8080
```

---

# 🌿 Final Frontend Branch

Final integrated frontend:

```
development
```

The branch includes:

```
✅ Customer workflows

✅ KYC integration

✅ Finance applications

✅ Assessment queue

✅ Credit assessments

✅ Approval workflows

✅ Disbursement

✅ EMI schedule

✅ Admin EMI Management

✅ Repayment

✅ Notifications

✅ Role-based navigation
```

# 🔮 Future Enhancements

```
💳 Real Payment Gateway

📨 Kafka / RabbitMQ Events

📧 Email / SMS Provider Integration

⚡ Redis Idempotency

📈 OpenTelemetry / Grafana

🐳 Docker

☸️ Kubernetes

☁️ Cloud Deployment
```

# 👨‍💻 Author

**Chaitanya Kassetty**

Sunkara Rambabu

Consumer Finance System  
Full-Stack Microservices Capstone Project

