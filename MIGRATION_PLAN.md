# Migration Plan: From Client-Server to Decentralized Architecture (Google Sheets + JSON)

## 1. Objective and Context

Transform "Quozen" from a traditional web application (React + Express + PostgreSQL) into a **decentralized Single Page Application (SPA)** that uses **Google Sheets** as a database.

* **Philosophy:** "Your data, your spreadsheet." The app acts solely as a UI layer to manage a shared Excel/Sheet file.

* **Data Strategy:** Hybrid Tabular/JSON Model. We use spreadsheet rows for main records and JSON within specific cells for nested data, ensuring write atomicity for complex objects like expense splits.

## 2. New Data Structure (Spreadsheets)

Each group will be a distinct Google Spreadsheet file. We eliminate separate sheets for 1:N relationships (like splits) to avoid transaction issues across multiple sheets.

**File:** `Quozen - [Group Name]` (Spreadsheet)

### Sheet: `Expenses` (Transactional)

Columns:

1. `id` (UUID)

2. `date` (ISO8601)

3. `description` (Text)

4. `amount` (Number)

5. `paidBy` (User ID / Email)

6. `category` (Text)

7. **`splits` (JSON)**: Serialized array containing split details. e.g., `[{"userId":"A","amount":50}, {"userId":"B","amount":50}]`.

8. `meta` (Optional JSON): Timestamps, edit history, etc.

### Sheet: `Settlements` (Payments/Balances)

Columns: `id`, `date`, `fromUser`, `toUser`, `amount`, `method`, `notes`.

### Sheet: `Members` (Group Metadata)

Columns: `userId`, `email`, `name`, `role`, `joinedAt`.

## 3. Execution Plan by Phases

### Phase 1: Environment Setup & Client API

* [ ] **Task 1.1: Project Configuration**

  * Update `.env` with Google Cloud credentials (`VITE_GOOGLE_CLIENT_ID`, etc.).

  * Enable **Google Drive API** and **Google Sheets API** in the Google Cloud Console.

* [ ] **Task 1.2: Unified Google Client (`client/src/lib/drive.ts`)**

  * Adapt the client to handle the structure with JSON columns.

  * Implement automatic parser/serializer for complex data columns.

### Phase 2: Authentication (OAuth2 PKCE)

* [ ] **Task 2.1: Implement Auth Provider**

  * Pure client-side PKCE flow.

  * Required Scopes: `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.file`.

### Phase 3: Data Layer (Business Logic)

* [ ] **Task 3.1: Reading and Parsing (Dashboard)**

  * Read range `Expenses!A2:Z`.

  * **Transformation:** Upon receiving data, parse the `splits` column from JSON String to JS Object so the app consumes it transparently.

  * Calculate balances in-memory by iterating over these objects.

* [ ] **Task 3.2: Group Creation**

  * Create Spreadsheet -> Create sheets (`Expenses`, `Settlements`, `Members`) -> Write Header Rows.

* [ ] **Task 3.3: Atomic Writing (Expenses)**

  * **Add Expense:**

    1. Construct the expense object.

    2. Serialize `splits` to a JSON string.

    3. Execute `sheets.

