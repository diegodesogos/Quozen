import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";

const locales: Record<string, any> = {
    en: enUS,
    es: es,
};

export function useDateFormatter() {
    const { i18n } = useTranslation();

    const formatDate = useCallback(
        (date: string | Date | number, token: string = "PPP") => {
            const dateObj = new Date(date);
            // Fallback to 'en' if language not found in map
            const currentLocale = locales[i18n.language?.split('-')[0]] || enUS;

            return format(dateObj, token, { locale: currentLocale });
        },
        [i18n.language]
    );

    return { formatDate };
}
