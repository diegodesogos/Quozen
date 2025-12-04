import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Set environment variables for tests
process.env.JWT_SECRET = 'test-secret';

// ResizeObserver mock for Radix UI components
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// Element methods mock for Radix UI (Select, ScrollArea, etc.)
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.Element.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
