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

    const opacity = useTransform(y, [0, 50], [0, 1]);
    const rotate = useTransform(y, [0, TRIGGER_THRESHOLD], [0, 180]);

    const startY = useRef(0);
    const isDragging = useRef(false);

    // --- Shared Logic ---

    const handleDragUpdate = (currentY: number) => {
        // Check enabled here to prevent drag if disabled
        if (!enabled || !isDragging.current || window.scrollY > 0 || isRefreshing) return;

        const delta = currentY - startY.current;

        if (delta > 0) {
            const damped = Math.min(delta * 0.5, MAX_DRAG);
            y.set(damped);
        }
    };

    const handleDragEnd = async () => {
        // Check enabled here
        if (!enabled || !isDragging.current || isRefreshing) return;
        isDragging.current = false;

        const currentY = y.get();

        if (currentY > TRIGGER_THRESHOLD) {
            setIsRefreshing(true);
            await controls.start({ y: 60 });

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

    // --- Handlers ---

    useEffect(() => {
        // We keep listeners attached but check 'enabled' inside callbacks to avoid churning listeners
        const handleWindowMouseMove = (e: MouseEvent) => {
            if (isDragging.current) {
                e.preventDefault();
                handleDragUpdate(e.clientY);
            }
        };

        const handleWindowMouseUp = () => {
            if (isDragging.current) {
                handleDragEnd();
            }
        };

        window.addEventListener("mousemove", handleWindowMouseMove);
        window.addEventListener("mouseup", handleWindowMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleWindowMouseMove);
            window.removeEventListener("mouseup", handleWindowMouseUp);
        };
    }, [isRefreshing, enabled]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!enabled || window.scrollY > 0 || isRefreshing) return;
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        handleDragUpdate(e.touches[0].clientY);
        if (enabled && isDragging.current && y.get() > 0 && e.cancelable) {
            e.preventDefault();
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!enabled || window.scrollY > 0 || isRefreshing) return;
        startY.current = e.clientY;
        isDragging.current = true;
    };

    // ALWAYS render the wrapper to prevent child remounting when enabled toggles
    return (
        <div
            ref={containerRef}
            className={`relative min-h-screen ${enabled ? 'cursor-default lg:cursor-grab active:cursor-grabbing' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
        >
            {/* Background Indicator - Only visible if enabled (conceptually, though opacity handles it) */}
            {enabled && (
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
            )}

            <motion.div
                animate={controls}
                style={isRefreshing ? { y: 60 } : { y }}
                className={`relative z-10 bg-background min-h-screen shadow-sm ${isRefreshing ? 'transition-transform will-change-transform' : ''}`}
            >
                {children}
            </motion.div>
        </div>
    );
}
