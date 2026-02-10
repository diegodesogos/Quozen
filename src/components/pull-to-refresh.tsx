import React, { useState, useRef, useEffect } from "react";
import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { Loader2, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PullToRefreshProps {
    children: React.ReactNode;
    onRefresh: () => Promise<void>;
    enabled: boolean;
}

const TRIGGER_THRESHOLD = 100;
const MAX_DRAG = 150;

export default function PullToRefresh({ children, onRefresh, enabled }: PullToRefreshProps) {
    const { t } = useTranslation();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const y = useMotionValue(0);
    const controls = useAnimation();

    // Transform y to opacity/rotation for UI feedback
    const opacity = useTransform(y, [0, 50], [0, 1]);
    const rotate = useTransform(y, [0, TRIGGER_THRESHOLD], [0, 180]);

    // We need to track startY to calculate delta manually to avoid scroll conflicts
    const startY = useRef(0);
    const isDragging = useRef(false);

    // If disabled, just render children
    if (!enabled) {
        return <>{children}</>;
    }

    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY > 0 || isRefreshing) return;
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current || window.scrollY > 0 || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const delta = currentY - startY.current;

        // Only activate if pulling down
        if (delta > 0) {
            // Logarithmic damping function for resistance
            const damped = Math.min(delta * 0.5, MAX_DRAG); // Simple linear damping for now, capped
            y.set(damped);

            // Prevent native scroll if we are actively pulling down from top
            if (e.cancelable) e.preventDefault();
        }
    };

    const handleTouchEnd = async () => {
        if (!isDragging.current || isRefreshing) return;
        isDragging.current = false;

        const currentY = y.get();

        if (currentY > TRIGGER_THRESHOLD) {
            setIsRefreshing(true);
            await controls.start({ y: 60 }); // Snap to loading position

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                controls.start({ y: 0 });
                y.set(0);
            }
        } else {
            controls.start({ y: 0 });
            y.set(0);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative min-h-screen"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Background Indicator */}
            <div className="absolute top-0 left-0 w-full flex justify-center pt-6 pointer-events-none z-0">
                <motion.div
                    style={{ opacity }}
                    className="flex items-center gap-2 text-sm text-muted-foreground font-medium"
                >
                    {isRefreshing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{t("common.loading", "Refreshing...")}</span>
                        </>
                    ) : (
                        <>
                            <motion.div style={{ rotate }}>
                                <ArrowDown className="w-4 h-4" />
                            </motion.div>
                            <span>{y.get() > TRIGGER_THRESHOLD ? "Release to refresh" : "Pull to refresh"}</span>
                        </>
                    )}
                </motion.div>
            </div>

            {/* Foreground Content */}
            <motion.div
                animate={controls}
                style={{ y }}
                className="relative z-10 bg-background min-h-screen transition-transform will-change-transform"
            >
                {children}
            </motion.div>
        </div>
    );
}
