/**
 * Client-side source code protection and DevTools deterrents.
 * This script disables standard user actions like Right-Click, standard DevTools keyboard shortcuts,
 * and runs a background protection loop using 'debugger' statements to deter DevTools usage.
 */

export function initSecurityProtections() {
  if (typeof window === 'undefined') return;

  // 1. Disable Right-Click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // 2. Disable DevTools keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+Shift+I / Cmd+Opt+I (Inspect)
    // Ctrl+Shift+J / Cmd+Opt+J (Console)
    // Ctrl+Shift+C / Cmd+Opt+C (Element Selector)
    if (modifierKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      return false;
    }

    // Ctrl+U / Cmd+Opt+U (View Source)
    if (modifierKey && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      return false;
    }

    // Ctrl+S / Cmd+S (Save Page)
    if (modifierKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      return false;
    }
  });

  // 3. DevTools Active Deterrent / Anti-Debugging Loop
  // This uses a dynamic evaluation of "debugger" to prevent normal execution when DevTools is open.
  const deterDevTools = () => {
    try {
      (function() {
        (function a() {
          try {
            (function b(i) {
              if (('' + i / i).length !== 1 || i % 20 === 0) {
                (function() {}).constructor('debugger')();
              } else {
                (function() {}).constructor('debugger')();
              }
              b(++i);
            })(0);
          } catch (e) {
            setTimeout(a, 1000);
          }
        })();
      })();
    } catch (e) {
      // Ignore errors
    }
  };

  // Run the deterrent loop in the background
  setTimeout(deterDevTools, 1000);
}
