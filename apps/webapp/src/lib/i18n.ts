import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en/translation.json';
import es from '../locales/es/translation.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            es: { translation: es }
        },
        fallbackLng: 'en',
        debug: false, // Disable verbose logging to keep console clean. Use this to enable again: import.meta.env.DEV, 

        interpolation: {
            escapeValue: false, // React already safes from xss
        },

        // Detect 'es-419', 'es-ES', etc. and map to 'es' if exact match not found
        nonExplicitSupportedLngs: true,
        supportedLngs: ['en', 'es'],
        load: 'languageOnly', // Load 'es' for 'es-MX'
    });

export default i18n;
