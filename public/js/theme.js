// Apply the saved theme before first paint so there's no flash. A classic (blocking) script,
// kept out of index.html so the Content-Security-Policy can forbid inline scripts.
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
