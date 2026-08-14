# Family Finance Hub

Build FamilyBudget — Professional Family Budget & Expense Management MVP

Build a complete, functional, responsive web application called FamilyBudget — a modern family budget and expense management platform.

This is a 5th-semester academic project, but it must be designed like a real-world SaaS MVP so it can potentially become a business in the future.

Do NOT create a static mockup. All major features must actually work and use persistent database data.

1. TECHNOLOGY STACK

Use:

Next.js

React

TypeScript

Tailwind CSS

PostgreSQL

Prisma ORM

Secure authentication

Recharts for charts

Git/GitHub-ready project structure

Use the existing/default stack supported by this platform where possible. Do not add unnecessary dependencies.

2. CORE PRODUCT IDEA

FamilyBudget allows families to:

Create an account

Create/manage a family

Add family members

Set a monthly budget

Set category-wise spending limits

Add daily expenses

Edit and delete expenses

Track total spending

Track remaining budget

Monitor category-wise spending

Receive overspending warnings

View monthly financial summaries

View charts and reports

The application should feel like a polished financial SaaS product, NOT a basic college CRUD project.

3. IMPORTANT ARCHITECTURE DECISION

Design the database for future multi-user family support.

Use this relationship:

User → Family → Family Members → Budgets / Expenses

Do NOT use only:

User → Budget → Expense

The system should be capable of supporting multiple family members sharing one family budget in the future.

4. DATABASE

Use PostgreSQL + Prisma.

Create these main models:

User

id

name

email

passwordHash

createdAt

updatedAt

Family

id

name

ownerId

createdAt

updatedAt

FamilyMember

id

familyId

userId

role

createdAt

Roles should support:

OWNER

ADMIN

MEMBER

VIEWER

Budget

id

familyId

month

year

totalLimit

createdAt

updatedAt

BudgetCategory

id

budgetId

category

limitAmount

createdAt

updatedAt

Expense

id

familyId

userId

amount

category

date

description

familyMember

createdAt

updatedAt

Create proper foreign-key relationships and indexes.

Ensure users cannot access another family’s budgets or expenses.

5. AUTHENTICATION

Create:

Landing Page

A professional landing page with:

FamilyBudget logo/name

Short tagline

Product explanation

Main CTA

Login button

Register button

Register

Fields:

Name

Email

Password

Confirm Password

Validate all fields.

Prevent duplicate email registration.

Login

Fields:

Email

Password

After login, redirect to Dashboard.

Protect all application pages from unauthenticated access.

6. MAIN APPLICATION LAYOUT

After login, create a professional dashboard layout.

Desktop:

FamilyBudget
────────────────────────

Dashboard
Budgets
Expenses
Reports
Profile

────────────────────────
Settings
Logout

Use a sidebar on desktop.

Use a responsive navigation/menu on mobile.

The UI should work properly on:

Desktop

Tablet

Mobile

7. DASHBOARD

Create a professional financial dashboard.

Show:

Summary Cards

Monthly Budget

Total Spent

Remaining Budget

Budget Usage %

Also show:

Number of expenses

Recent expenses

Current month’s budget status

Overspending alerts

Example:

Monthly Budget       ₹50,000
Total Spent          ₹31,250
Remaining            ₹18,750
Budget Used          62.5%

Do NOT hard-code these numbers.

Everything must come from the database.

8. BUDGET MANAGEMENT

Create a complete Budgets page.

Users should be able to:

Select month

Select year

Create monthly budget

Set total budget

Add category-wise limits

Edit category limits

Delete category limits

View allocated amount

View remaining amount

Default categories:

Food

Transport

Shopping

Bills

Education

Healthcare

Entertainment

Other

Prevent:

Negative amounts

Invalid values

Empty required fields

Warn the user if category allocations exceed the total monthly budget.

9. EXPENSE MANAGEMENT

Create a complete Expenses page.

Users should be able to:

Add expense

Edit expense

Delete expense

View expense history

Search expenses

Filter by category

Filter by date

Sort expenses

Expense form:

Amount
Category
Date
Description
Family Member

Display expenses in a clean table on desktop and card/list format on mobile.

Include a confirmation dialog before deleting.

10. AUTOMATIC BUDGET CALCULATIONS

Calculate everything dynamically.

Remaining Budget

Remaining Budget =
Monthly Budget - Total Expenses

Category Remaining

Category Remaining =
Category Limit - Category Expenses

Budget Usage

Budget Usage % =
(Total Expenses / Monthly Budget) × 100

Warning Levels

Below 70%:
Normal

70–90%:
Warning

Above 90%:
Critical

Above 100%:
Overspending

Display clear visual indicators.

11. REPORTS

Create a Reports page.

Include:

Category-wise Spending

Use a donut/pie chart.

Monthly Spending

Use a bar/line chart.

Budget vs Actual

Compare:

Category limit

Actual spending

Remaining amount

Monthly Summary

Allow the user to select a month/year and view its spending.

Use Recharts.

Charts must use real database data and update dynamically.

12. UI DESIGN

Create a premium-looking but simple financial dashboard.

Design style:

Modern

Clean

Minimal

Professional

Friendly

Trustworthy

Use Tailwind CSS.

Create reusable components for:

Navbar

Sidebar

Cards

Buttons

Inputs

Selects

Modals

Tables

Alerts

Badges

Progress bars

Charts

Loading states

Empty states

Error states

Do not duplicate UI code.

13. RESPONSIVE DESIGN

The entire application must be responsive.

Desktop:

Sidebar

Dashboard grid

Tables

Charts

Mobile:

Collapsible navigation

Stacked cards

Mobile-friendly forms

Responsive charts

Expense cards instead of wide tables where necessary

Do not allow horizontal scrolling caused by poorly designed components.

14. API / BACKEND

Use clean Next.js API routes/server actions as appropriate.

Create functionality equivalent to:

Budgets:
GET
POST
PUT
DELETE

Expenses:
GET
POST
PUT
DELETE

Reports:
GET monthly summary
GET category summary

Every backend operation must:

Validate input

Authenticate user

Check family ownership

Handle errors

Return appropriate responses

Never expose passwords or sensitive information.

15. SECURITY

Implement basic production-level security:

Secure password handling

Protected routes

Authentication

Authorization

Server-side validation

User/family ownership checks

Environment variables

No secrets in frontend

No sensitive information in API responses

Create .env.example.

Never expose database credentials in frontend code.

16. ERROR & LOADING STATES

Every major page should have:

Loading state

Show a professional spinner/skeleton.

Empty state

Example:

“No expenses found for this month.”

Error state

Example:

“Something went wrong. Please try again.”

Success feedback

Show confirmation when:

Budget created

Budget updated

Expense added

Expense updated

Expense deleted

17. PROFILE

Create a Profile page where the authenticated user can:

View name

View email

Update name

View family

View family role

Do not allow users to change protected information without proper validation.

18. CODE ARCHITECTURE

Keep the project modular.

Use a structure similar to:

app/
  dashboard/
  budgets/
  expenses/
  reports/
  profile/
  api/

components/
  ui/
  layout/
  dashboard/
  budgets/
  expenses/
  charts/

lib/
  prisma
  auth
  validations
  calculations

services/
  user
  family
  budget
  expense
  report

prisma/
  schema.prisma

types/

Keep business logic separate from UI components.

Do not put large database queries directly inside UI components.

19. BUSINESS-READY FOUNDATION

This is currently an MVP, but structure it so these can be added later without rebuilding the entire application:

Multiple family members

Subscription plans

Premium features

Receipt uploads

PDF/CSV export

Recurring expenses

Notifications

Income management

Savings goals

Investment tracking

AI expense categorization

OCR bill scanning

Smart budgeting suggestions

Chatbot

Payment system

DO NOT implement these features now.

Only make the architecture extensible enough for them.

20. IMPORTANT: KEEP THE CURRENT VERSION REALISTIC

Do not over-engineer the MVP.

The current working product should focus on:

Authentication

Family creation/basic family structure

Budget management

Category-wise limits

Expense management

Budget calculations

Overspending alerts

Dashboard

Reports

Responsive UI

Do not add unnecessary enterprise features.

21. PROFESSIONAL UX

Add:

Clear navigation

Consistent buttons

Proper form validation

Confirmation dialogs

Toast/success messages

Helpful empty states

Clear error messages

Currency formatting in ₹

Date formatting

Accessible form labels

Responsive design

Use Indian Rupees as the default currency.

22. FINAL QUALITY REQUIREMENTS

Before considering the application complete:

Make sure registration works.

Make sure login works.

Make sure protected routes work.

Make sure database records persist after refresh.

Make sure budgets persist.

Make sure expenses persist.

Make sure edit/delete operations work.

Make sure calculations are correct.

Make sure overspending alerts work.

Make sure charts use real data.

Make sure users cannot access another family’s data.

Make sure mobile layout works.

Remove placeholder data.

Remove unnecessary console errors.

Make sure there are no broken buttons or fake interactions.

Do not create fake/demo functionality where real functionality is expected.

23. DESIGN DIRECTION

The final website should look like a product that could realistically be launched.

Think:

modern fintech SaaS + family-friendly UX

It should be visually impressive enough for a college project demonstration while maintaining a professional architecture suitable for future commercialization.

Do not make the interface overly complicated.

Prioritize clarity and usability.

24. DEVELOPMENT INSTRUCTION

Build the application from this specification.

First establish:

Project structure

Database schema

Authentication

Main application layout

Then implement:

Family structure

Budget Management

Expense Management

Budget calculations

Dashboard

Reports

Responsive refinement

Error/loading states

Do not implement future AI/OCR/payment/subscription features.

Most importantly:

Build a fully functional application, not a visual prototype.

Use real database operations wherever data is required.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c3982f83-26db-4e98-b0b5-4f06d57bd0bb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
