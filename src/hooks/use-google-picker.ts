import { useState, useCallback } from "react";
import { useAuth } from "@/context/auth-provider";

const API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
const APP_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.split("-")[0]; // Project ID usually first part of client ID

interface UseGooglePickerProps {
    onPick: (doc: google.picker.PickerDocument) => void;
    onCancel?: () => void;
}

export function useGooglePicker({ onPick, onCancel }: UseGooglePickerProps) {
    const { token } = useAuth();
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load the Google API script if not already loaded
    const loadPickerApi = useCallback(() => {
        if (window.google && window.google.picker) {
            setIsLoaded(true);
            return;
        }

        if (!API_KEY) {
            setError("VITE_GOOGLE_PICKER_API_KEY is missing in environment variables.");
            return;
        }

        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.async = true;
        script.defer = true;

        script.onload = () => {
            if (window.gapi) {
                window.gapi.load("picker", {
                    callback: () => setIsLoaded(true),
                });
            } else {
                setError("Google API failed to load.");
            }
        };

        script.onerror = () => setError("Failed to load Google Picker API script.");
        document.body.appendChild(script);
    }, []);

    // Open the picker
    const openPicker = useCallback(() => {
        if (!isLoaded) {
            loadPickerApi();
            return;
        }

        if (!token) {
            setError("User not authenticated.");
            return;
        }

        if (!API_KEY || !APP_ID) {
            setError("Missing API Key or App ID configuration.");
            return;
        }

        // DocsView extends View. We chain methods here.
        // The type definition update ensures setMimeTypes returns 'this', preserving DocsView type.
        const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
            .setMimeTypes("application/vnd.google-apps.spreadsheet")
            // We want to see files shared with us, so we don't restrict to "Owned by me"
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false);

        const picker = new google.picker.PickerBuilder()
            .setAppId(APP_ID)
            .setOAuthToken(token)
            .setDeveloperKey(API_KEY)
            .addView(view)
            .setCallback((data: google.picker.PickerResponse) => {
                if (data.action === google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
                    onPick(data.docs[0]);
                } else if (data.action === google.picker.Action.CANCEL) {
                    if (onCancel) onCancel();
                }
            })
            .build();

        picker.setVisible(true);
    }, [isLoaded, token, onPick, onCancel, loadPickerApi]);

    return { openPicker, isLoaded, error };
}
