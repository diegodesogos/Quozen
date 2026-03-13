import { createContext, useContext } from 'react';
import { AiProvider } from '@quozen/core';

export type AiAvailabilityStatus = 'checking' | 'available' | 'unavailable';

export interface AiFeatureState {
    status: AiAvailabilityStatus;
    reason?: string;
    provider?: AiProvider;
}

export const AiFeatureContext = createContext<AiFeatureState | undefined>(undefined);

export const useAiFeature = () => {
    const context = useContext(AiFeatureContext);
    if (context === undefined) {
        throw new Error('useAiFeature must be used within an AiFeatureProvider');
    }
    return context;
};
