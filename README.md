# Quozen - Decentralized Expense Sharing

Quozen is a modern expense sharing application designed for simplicity and privacy. Unlike traditional split-wise clones that store your financial data on their servers, **Quozen is decentralized**.

**Your Data, Your Drive.**
Quozen operates entirely within your browser (Single Page Application). It uses your personal Google Drive to store groups, expenses, and settlements as standard Google Sheets. This means you own your data, and you can even view or edit it directly in Google Sheets!

## 🚀 Features

* **Google Sign-In**: Secure authentication using your existing Google account.
* **Decentralized Storage**: Automatically creates a "Quozen" spreadsheet in your Google Drive for every group.
* **Expense Tracking**: Add expenses with categories, descriptions, and custom splits.
* **Smart Settlements**: Client-side algorithms calculate who owes whom to simplify debt settlement.
* **Transparent Data**: Every group is just a Google Sheet. You can export, backup, or analyze your data using Excel/Sheets tools anytime.

## 🔐 Architecture & Security

Quozen utilizes **Client-Side OAuth 2.0** via Google Identity Services. There is **no backend server** handling your login or data. The relationship is strictly **You ↔ Google**.

### How it Works
1.  **Implicit Grant Flow**: When you sign in, the app requests an access token directly from Google.
2.  **Token Storage**: The access token is stored securely in your browser's memory for the duration of the session.
3.  **Direct API Calls**: The app uses this token to fetch/update files directly via the Google Drive and Sheets APIs.

### Required Permissions (Scopes)
To function, Quozen requests these specific permissions:

* `https://www.googleapis.com/auth/drive.file`: **File Management.** Allows Quozen to access *only* the files it creates. It **cannot** see your personal photos, docs, or other spreadsheets.
* `https://www.googleapis.com/auth/spreadsheets`: **Data Operations.** Allows reading and writing expenses to the specific group sheets.
* `email` & `profile`: **Identity.** Used to display your name/avatar and identify you in expense splits.

## 🛠 Tech Stack

* **Frontend**: React, TypeScript, Vite
* **Styling**: Tailwind CSS, Shadcn UI
* **State Management**: TanStack Query (React Query)
* **Authentication & Data**: Google Identity Services & Google Drive/Sheets API v4

## 🏃‍♂️ Getting Started

### Prerequisites

1.  Node.js installed.
2.  A Google Cloud Console project with **Google Drive API** and **Google Sheets API** enabled.
3.  An OAuth 2.0 Client ID configured for your development URL (e.g., `http://localhost:3001`).

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory:
    ```env
    VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
    ```
4.  Start the development server:
    ```bash
    npm run dev
    ```

5.  Open `http://localhost:3001` in your browser.

## 🧪 Testing

Run the client-side test suite:

```bash
npm run test:client

