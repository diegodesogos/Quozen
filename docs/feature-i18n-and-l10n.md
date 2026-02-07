# **Feature Internationalization (i18n) and Localization (l10n) Support**

**Status**: ✅ **Completed**

**Title:** Internationalization (i18n) & Localization (l10n) Support

**Description:** Enable Quozen to support multiple languages and regional formats, starting with English (US) and Spanish (Latin America). This initiative aims to expand the user base to non-English speakers and improve the user experience by respecting local conventions for dates, numbers, and currency formatting. The system will auto-detect the user's preference ("System" default) while offering manual overrides via the Profile settings.

**Success Metrics:**

* **Adoption:** 100% of UI static text is extracted to translation files.  
* **Reliability:** Zero regressions in date/currency display across the application.  
* **User Experience:** Changing the language in Profile updates the UI instantly without a full page reload.

---

# **2\. SCOPE & CONSTRAINTS**

**In-Scope:**

* **Infrastructure:** Installation and configuration of `react-i18next` and `i18next-browser-languagedetector`.  
* **Locales:** strict support for `en-US` (English) and `es-419` (Latin American Spanish).  
* **Detection Logic:** Implementation of "System" (Auto-detect), "English", and "Spanish" options.  
* **Mapping:** Automatic mapping of regional variations (e.g., `es-ES` → `es-419`, `en-GB` → `en-US`).  
* **UI Components:** Adding a Language selector to `src/pages/profile.tsx`.  
* **Formatting:** Creating a custom hook (`useDateFormatter`) for `date-fns` and a utility for `Intl.NumberFormat`.  
* **Translations:** Extraction of all static UI text (buttons, headers, labels) and **general** toast notifications (e.g., "Group created", "Expense saved").

**Out-of-Scope:**

* **Backend Errors:** Translating specific error messages returned by the Google Drive API or internal exceptions (e.g., stack traces, specific HTTP 403 details).  
* **User Content:** Translating user-generated content (e.g., Expense descriptions, Group names).  
* **Right-to-Left (RTL):** Layout adjustments for RTL languages.

**Technical Dependencies:**

* **Storage Schema:** `src/lib/storage/types.ts` must be updated to store `locale` in `UserSettings`.  
* **Date Library:** Depends on `date-fns` (existing dependency) locale objects.

**Non-Functional Requirements (NFRs):**

* **Performance:** Language files should be loaded efficiently (bundled or lazy-loaded) to not impact TTI (Time to Interactive).  
* **Persistence:** Language preference must persist across sessions via `quozen-settings.json`.  
* **Fallback:** If a translation key is missing in Spanish, the system must fallback to English.

---

# **3\. USER STORIES**

### **US-101: i18n Infrastructure & Detection Strategy**
**Status**: ✅ **Completed**

**Narrative:** As a Developer, I want to establish the translation engine and detection logic, So that the app knows which language to serve based on user preference or system defaults.

**Acceptance Criteria:**

* **Scenario 1 (System Default):** * **Given** a user with browser language set to "es-ES" (Spain).  
  * **When** they load the app for the first time.  
  * **Then** the app initializes with `es-419` (LatAm Spanish) resources.  
* **Scenario 2 (Fallback):** * **Given** a user with browser language set to "fr-FR" (French).  
  * **When** they load the app.  
  * **Then** the app defaults to `en-US`.

**Dev Notes:**

* Install `react-i18next`, `i18next`, `i18next-browser-languagedetector`.  
* Create `src/lib/i18n.ts` configuration.  
* Configure detector caches to check `localStorage` first, then navigator.  
* Create `src/locales/en/translation.json` and `src/locales/es/translation.json`.  
* Implement language mapping: `es-*` \-\> `es`, `en-*` \-\> `en`.

---

### **US-102: Profile Language Setting & Persistence**
**Status**: ✅ **Completed**

**Narrative:** As a User, I want to explicitly select my preferred language in my profile, So that the app uses that language regardless of my device settings.

**Acceptance Criteria:**

* **Scenario 1 (Update Preference):** * **Given** I am on the Profile page.  
  * **When** I select "Español" from the "Language" dropdown.  
  * **Then** the UI immediately updates to Spanish.  
  * **And** the setting `preferences.locale = 'es'` is saved to `quozen-settings.json`.  
* **Scenario 2 (Select System):** * **Given** my manual preference is "English".  
  * **When** I switch back to "System".  
  * **Then** the app reverts to detecting the language from the browser.

**Dev Notes:**

Update `UserSettings` interface in `src/lib/storage/types.ts`:  
TypeScript  
preferences: {  
  defaultCurrency: string;  
  theme?: "light" | "dark" | "system";  
  locale?: "en" | "es" | "system"; // New Field  
};

* * Update `src/pages/profile.tsx`: Add the `Select` component for Language below Currency.  
* Update `useSettings` hook to apply the language change via `i18next.changeLanguage()`.

---

### **US-103: Localized Date Formatting Wrapper**
**Status**: ✅ **Completed**

**Narrative:** As a Developer, I want a centralized hook for date formatting, So that all dates (e.g., "Jan 12") automatically display in the correct language (e.g., "12 ene").

**Acceptance Criteria:**

* **Scenario 1 (Spanish Date):** * **Given** the app is in Spanish mode.  
  * **When** the Dashboard displays an expense date.  
  * **Then** it renders as "12 ene" (lowercase month is standard in Spanish) instead of "Jan 12".

**Dev Notes:**

* Create `src/hooks/use-date-formatter.ts`.  
* The hook should consume the current i18n language.  
* It must import `enUS` and `es` locales from `date-fns/locale`.  
* Expose a `formatDate(date, token)` function that internally calls `date-fns/format` with the correct locale object.  
* **Refactor:** Replace direct `format()` calls in `dashboard.tsx`, `activity-hub.tsx`, and `expenses.tsx`.

---

### **US-104: Localized Currency & Number Formatting**
**Status**: ✅ **Completed**

**Narrative:** As a User, I want to see numbers formatted according to my region (e.g., decimal commas vs points), So that financial data is familiar and easy to read.

**Acceptance Criteria:**

* **Scenario 1 (Spanish Number Format):** * **Given** the app is in Spanish mode (LatAm often uses dots/commas differently depending on specific country, but we will standardize to the locale `es-419`).  
  * **When** I view an expense amount of 1200.50.  
  * **Then** it displays according to `Intl.NumberFormat('es-419')` (likely `1,200.50` or `1.200,50` depending on browser implementation of that locale tag).  
* **Scenario 2 (Currency Symbol):** * **Given** my preferred currency is "EUR" and language is English.  
  * **When** I view the balance.  
  * **Then** it displays as "€50.00" (Symbol from Currency, Formatting from English Locale).

**Dev Notes:**

* Create utility `src/lib/format-currency.ts`.  
* Use standard API: `new Intl.NumberFormat(currentLocale, { style: 'currency', currency: userCurrency }).format(value)`.  
* **Refactor:** Replace manual `${amount.toFixed(2)}` interpolations in `dashboard.tsx` and `expenses.tsx`.

---

### **US-105: UI Text Extraction & Translation**
**Status**: ✅ **Completed**

**Narrative:** As a User, I want to see all navigation, buttons, and headers in my selected language, So that I can navigate the app comfortably.

**Acceptance Criteria:**

* **Scenario 1 (Navigation):** * **Given** Spanish is selected.  
  * **When** I look at the Bottom Navigation.  
  * **Then** "Activity" reads "Actividad" and "Groups" reads "Grupos".  
* **Scenario 2 (General Toasts):** * **Given** Spanish is selected.  
  * **When** I create a group successfully.  
  * **Then** the toast notification reads "Grupo creado" instead of "Group created".

**Dev Notes:**

* Use `useTranslation` hook in components.  
* Key areas to refactor:  
  * `src/components/header.tsx` (Title, "Select Group").  
  * `src/components/bottom-navigation.tsx` (Labels).  
  * `src/pages/dashboard.tsx` ("Your Balance", "Settle Up", "You owe").  
  * `src/pages/profile.tsx` (Labels, Buttons).  
  * `src/hooks/use-toast.ts` (Requires passing translated strings *into* the toast call, not translating inside the toast component).