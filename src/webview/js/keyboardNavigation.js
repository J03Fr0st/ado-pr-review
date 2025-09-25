/**
 * Keyboard navigation utilities for Azure DevOps PR Reviewer webviews
 */

class KeyboardNavigationManager {
    constructor() {
        this.initializeKeyboardNavigation();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    /**
     * Initialize keyboard navigation features
     */
    initializeKeyboardNavigation() {
        // Make all interactive elements keyboard accessible
        this.makeElementsKeyboardAccessible();

        // Setup focus management
        this.setupFocusManagement();

        // Setup keyboard shortcuts
        this.setupGlobalShortcuts();
    }

    /**
     * Make interactive elements keyboard accessible
     */
    makeElementsKeyboardAccessible() {
        // Add keyboard support to clickable elements
        document.querySelectorAll('.clickable').forEach(element => {
            element.setAttribute('tabindex', '0');
            element.setAttribute('role', 'button');
            element.addEventListener('keydown', this.handleKeyboardActivation.bind(this));
        });

        // Ensure all form inputs have proper labels
        document.querySelectorAll('input, textarea, select').forEach(element => {
            if (!element.getAttribute('aria-label') && !element.id) {
                const label = document.querySelector(`label[for="${element.id}"]`);
                if (!label) {
                    element.setAttribute('aria-label', element.getAttribute('placeholder') || 'Input field');
                }
            }
        });
    }

    /**
     * Setup focus management
     */
    setupFocusManagement() {
        // Add focus indicators
        document.addEventListener('focusin', (event) => {
            const target = event.target;
            if (target.matches('button, input, textarea, select, a, [tabindex="0"]')) {
                this.showKeyboardNavigationIndicator();
                this.addFocusIndicator(target);
            }
        });

        document.addEventListener('focusout', (event) => {
            const target = event.target;
            this.removeFocusIndicator(target);
        });

        // Setup focus traps for modals
        this.setupModalFocusTraps();
    }

    /**
     * Setup modal focus traps
     */
    setupModalFocusTraps() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const modal = node.closest('.modal');
                        if (modal && modal.style.display !== 'none') {
                            this.trapFocusInModal(modal);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Trap focus within a modal
     */
    trapFocusInModal(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleKeyDown = (event) => {
            if (event.key !== 'Tab') return;

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    event.preventDefault();
                }
            }
        };

        modal.addEventListener('keydown', handleKeyDown);

        // Focus first element
        setTimeout(() => firstElement.focus(), 100);

        // Store cleanup function
        modal.focusTrapCleanup = () => {
            modal.removeEventListener('keydown', handleKeyDown);
        };
    }

    /**
     * Setup global keyboard shortcuts
     */
    setupGlobalShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Ignore if user is typing in an input field
            if (event.target.matches('input, textarea, select')) {
                return;
            }

            const key = event.key;
            const ctrl = event.ctrlKey || event.metaKey;
            const alt = event.altKey;
            const shift = event.shiftKey;

            // Global shortcuts
            if (key === 'Escape') {
                this.handleEscapeKey();
            } else if (key === '?' && ctrl) {
                this.showKeyboardShortcutsHelp();
            } else if (key === 'h' && alt) {
                this.showHelp();
            } else if (key === 'r' && ctrl) {
                this.refreshContent();
            }

            // Navigation shortcuts
            if (key === 'Tab' && alt) {
                event.preventDefault();
                this.cycleFocusableElements(shift);
            }

            // Action shortcuts
            if (key === 'a' && ctrl) {
                event.preventDefault();
                this.approveCurrentPullRequest();
            } else if (key === 'r' && alt) {
                event.preventDefault();
                this.rejectCurrentPullRequest();
            } else if (key === 'c' && ctrl) {
                event.preventDefault();
                this.addComment();
            }
        });
    }

    /**
     * Setup event listeners for keyboard navigation
     */
    setupEventListeners() {
        // Detect keyboard navigation
        document.addEventListener('keydown', (event) => {
            if (['Tab', 'Shift', 'Control', 'Alt'].includes(event.key)) {
                this.showKeyboardNavigationIndicator();
            }
        });

        // Hide keyboard navigation indicator on mouse use
        document.addEventListener('mousedown', () => {
            this.hideKeyboardNavigationIndicator();
        });

        // Setup skip link functionality
        const skipLink = document.querySelector('.skip-to-content');
        if (skipLink) {
            skipLink.addEventListener('click', (event) => {
                event.preventDefault();
                const mainContent = document.querySelector('[role="main"]');
                if (mainContent) {
                    mainContent.focus();
                    mainContent.scrollIntoView();
                }
            });
        }
    }

    /**
     * Handle keyboard activation (Space/Enter)
     */
    handleKeyboardActivation(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.target.click();
        }
    }

    /**
     * Handle Escape key
     */
    handleEscapeKey() {
        // Close modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.style.display !== 'none') {
                modal.style.display = 'none';
                if (modal.focusTrapCleanup) {
                    modal.focusTrapCleanup();
                }
            }
        });

        // Close dropdowns
        const dropdowns = document.querySelectorAll('.dropdown.open');
        dropdowns.forEach(dropdown => {
            dropdown.classList.remove('open');
        });

        // Return focus to main content
        const mainContent = document.querySelector('[role="main"]');
        if (mainContent) {
            mainContent.focus();
        }
    }

    /**
     * Show keyboard navigation indicator
     */
    showKeyboardNavigationIndicator() {
        const indicator = document.querySelector('.keyboard-nav-indicator');
        if (indicator) {
            indicator.classList.add('visible');
            clearTimeout(this.indicatorTimeout);
            this.indicatorTimeout = setTimeout(() => {
                this.hideKeyboardNavigationIndicator();
            }, 2000);
        }
    }

    /**
     * Hide keyboard navigation indicator
     */
    hideKeyboardNavigationIndicator() {
        const indicator = document.querySelector('.keyboard-nav-indicator');
        if (indicator) {
            indicator.classList.remove('visible');
        }
    }

    /**
     * Add focus indicator to element
     */
    addFocusIndicator(element) {
        element.classList.add('keyboard-focus');
    }

    /**
     * Remove focus indicator from element
     */
    removeFocusIndicator(element) {
        element.classList.remove('keyboard-focus');
    }

    /**
     * Cycle through focusable elements
     */
    cycleFocusableElements(reverse = false) {
        const focusableElements = document.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const currentIndex = Array.from(focusableElements).findIndex(
            element => element === document.activeElement
        );

        let nextIndex;
        if (currentIndex === -1) {
            nextIndex = reverse ? focusableElements.length - 1 : 0;
        } else {
            nextIndex = reverse
                ? (currentIndex - 1 + focusableElements.length) % focusableElements.length
                : (currentIndex + 1) % focusableElements.length;
        }

        focusableElements[nextIndex].focus();
    }

    /**
     * Show keyboard shortcuts help
     */
    showKeyboardShortcutsHelp() {
        const helpContent = `
            <div class="keyboard-shortcuts-help" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
                <h2>Keyboard Shortcuts</h2>
                <div class="shortcut-section">
                    <h3>Navigation</h3>
                    <ul>
                        <li><kbd>Alt+Tab</kbd> - Cycle through focusable elements</li>
                        <li><kbd>Shift+Alt+Tab</kbd> - Cycle backwards</li>
                        <li><kbd>Escape</kbd> - Close modals/dropdowns</li>
                        <li><kbd>Ctrl+?</kbd> - Show this help</li>
                    </ul>
                </div>
                <div class="shortcut-section">
                    <h3>Pull Request Actions</h3>
                    <ul>
                        <li><kbd>Ctrl+A</kbd> - Approve pull request</li>
                        <li><kbd>Alt+R</kbd> - Reject pull request</li>
                        <li><kbd>Ctrl+C</kbd> - Add comment</li>
                        <li><kbd>Ctrl+R</kbd> - Refresh content</li>
                    </ul>
                </div>
                <div class="shortcut-section">
                    <h3>General</h3>
                    <ul>
                        <li><kbd>Alt+H</kbd> - Show help</li>
                        <li><kbd>Enter/Space</kbd> - Activate buttons/links</li>
                        <li><kbd>Tab</kbd> - Navigate between elements</li>
                    </ul>
                </div>
                <button class="btn btn-primary" onclick="this.parentElement.remove()">Close</button>
            </div>
        `;

        const helpElement = document.createElement('div');
        helpElement.innerHTML = helpContent;
        helpElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
        `;

        document.body.appendChild(helpElement);

        // Focus first focusable element
        const firstFocusable = helpElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }

        // Trap focus
        this.trapFocusInModal(helpElement);
    }

    /**
     * Show help
     */
    showHelp() {
        this.showKeyboardShortcutsHelp();
    }

    /**
     * Refresh content
     */
    refreshContent() {
        // Send refresh message to extension
        if (window.vscode) {
            window.vscode.postMessage({ type: 'refresh' });
        }
    }

    /**
     * Approve current pull request
     */
    approveCurrentPullRequest() {
        const approveButton = document.querySelector('.btn-approve');
        if (approveButton && !approveButton.disabled) {
            approveButton.click();
        }
    }

    /**
     * Reject current pull request
     */
    rejectCurrentPullRequest() {
        const rejectButton = document.querySelector('.btn-reject');
        if (rejectButton && !rejectButton.disabled) {
            rejectButton.click();
        }
    }

    /**
     * Add comment
     */
    addComment() {
        const commentTextarea = document.querySelector('#commentText');
        if (commentTextarea) {
            commentTextarea.focus();
        }
    }

    /**
     * Setup keyboard shortcuts documentation
     */
    setupKeyboardShortcuts() {
        // Add keyboard shortcuts help button
        const helpButton = document.createElement('button');
        helpButton.className = 'keyboard-help-btn';
        helpButton.innerHTML = '?';
        helpButton.setAttribute('aria-label', 'Keyboard shortcuts help');
        helpButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: 1px solid var(--vscode-panel-border);
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            z-index: 100;
        `;

        helpButton.addEventListener('click', () => {
            this.showKeyboardShortcutsHelp();
        });

        document.body.appendChild(helpButton);
    }

    /**
     * Initialize accessibility features
     */
    initializeAccessibility() {
        // Add skip to content link
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-to-content';
        skipLink.textContent = 'Skip to main content';
        document.body.insertBefore(skipLink, document.body.firstChild);

        // Add main content id if not present
        const mainContent = document.querySelector('[role="main"]');
        if (mainContent && !mainContent.id) {
            mainContent.id = 'main-content';
        }

        // Add keyboard navigation indicator
        const indicator = document.createElement('div');
        indicator.className = 'keyboard-nav-indicator';
        indicator.textContent = 'Keyboard navigation active';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        document.body.appendChild(indicator);

        // Add announcements container
        const announcements = document.createElement('div');
        announcements.className = 'announcements';
        announcements.setAttribute('role', 'status');
        announcements.setAttribute('aria-live', 'polite');
        announcements.setAttribute('aria-atomic', 'true');
        document.body.appendChild(announcements);

        // Initialize screen reader announcements
        this.announcements = announcements;
    }

    /**
     * Make screen reader announcement
     */
    announce(message, priority = 'polite') {
        if (this.announcements) {
            this.announcements.setAttribute('aria-live', priority);
            this.announcements.textContent = message;

            // Clear after announcement
            setTimeout(() => {
                this.announcements.textContent = '';
            }, 1000);
        }
    }
}

// Initialize keyboard navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new KeyboardNavigationManager();
    });
} else {
    new KeyboardNavigationManager();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardNavigationManager;
}