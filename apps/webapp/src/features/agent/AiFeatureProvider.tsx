import React, { Suspense, lazy } from 'react';
import { useSettings } from '@/hooks/use-settings';

const AgentModule = lazy(() => import('@/features/agent/AgentModule'));

export const AiFeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const aiProvider = settings?.preferences?.aiProvider || 'auto';
    const isEnabled = aiProvider !== 'disabled';

    return (
        <>
            {children}
            {isEnabled && (
                <Suspense fallback={null}>
                    <AgentModule />
                </Suspense>
            )}
        </>
    );
};
