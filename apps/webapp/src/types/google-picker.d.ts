/**
 * TypeScript declarations for Google Picker API
 * @see https://developers.google.com/picker/docs/reference
 */

declare namespace google.picker {
  class PickerBuilder {
    constructor();
    setAppId(appId: string): PickerBuilder;
    setOAuthToken(oauthToken: string): PickerBuilder;
    setDeveloperKey(developerKey: string): PickerBuilder;
    addView(view: View | ViewId): PickerBuilder;
    enableFeature(feature: Feature): PickerBuilder;
    disableFeature(feature: Feature): PickerBuilder;
    setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    setLocale(locale: string): PickerBuilder;
    setOrigin(origin: string): PickerBuilder;
    setMaxItems(max: number): PickerBuilder;
    setSelectableMimeTypes(mimeTypes: string): PickerBuilder;
    build(): Picker;
  }

  class Picker {
    setVisible(visible: boolean): void;
    dispose(): void;
  }

  class View {
    constructor(viewId: ViewId);
    // Return 'this' to allow chaining in subclasses (DocsView)
    setMimeTypes(mimeTypes: string): this;
    setQuery(query: string): this;
  }

  class DocsView extends View {
    constructor(viewId?: ViewId);
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
    setMode(mode: DocsViewMode): DocsView;
    setOwnedByMe(ownedByMe: boolean): DocsView;
    setStarred(starred: boolean): DocsView;
    setParent(folderId: string): DocsView;
  }

  enum ViewId {
    DOCS = "docs",
    DOCS_IMAGES = "docs-images",
    DOCS_IMAGES_AND_VIDEOS = "docs-images-and-videos",
    DOCS_VIDEOS = "docs-videos",
    DOCUMENTS = "documents",
    DRAWINGS = "drawings",
    FOLDERS = "folders",
    FORMS = "forms",
    PDFS = "pdfs",
    PRESENTATIONS = "presentations",
    SPREADSHEETS = "spreadsheets",
  }

  enum DocsViewMode {
    GRID = "grid",
    LIST = "list",
  }

  enum Feature {
    MINE_ONLY = "mineOnly",
    MULTISELECT_ENABLED = "multiselectEnabled",
    NAV_HIDDEN = "navHidden",
    SIMPLE_UPLOAD_ENABLED = "simpleUploadEnabled",
    SUPPORT_DRIVES = "supportDrives",
  }

  enum Action {
    PICKED = "picked",
    CANCEL = "cancel",
    LOADED = "loaded",
  }

  interface PickerResponse {
    action: Action;
    docs?: PickerDocument[];
    viewToken?: string[];
  }

  interface PickerDocument {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    sizeBytes?: number;
    lastEditedUtc?: number;
    iconUrl?: string;
    description?: string;
    parentId?: string;
    serviceId?: string;
    isShared?: boolean;
  }
}

interface Window {
  gapi?: {
    // Allows both simple callback and config object
    load: (api: string, callback: (() => void) | { callback: () => void }) => void;
    client?: {
      init: (config: { apiKey: string; discoveryDocs?: string[] }) => Promise<void>;
    };
  };
  google?: {
    picker: typeof google.picker;
  };
}
