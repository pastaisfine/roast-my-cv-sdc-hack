---
name: OCR runtime provisioning
description: Package-manager and OCR orientation traps encountered with the CPU runtime.
---

Keep EasyOCR on the normal Python registry; only torch and torchvision belong on the CPU wheel registry.

**Why:** The Python package installer generated an overly broad CPU-index mapping that included EasyOCR, making a compatible release appear unavailable. Removing only the offending entry was undone by the next installer invocation; a focused project manifest and locked sync resolved it.

**How to apply:** If package resolution says EasyOCR has no versions, inspect generated source mappings before changing the OCR engine or Python runtime.

Prefer upright recognition first and whole-page orientation candidates for low-quality results, not EasyOCR's per-box rotation selection.

**Why:** Per-box rotation selected a spurious single character instead of a clearly readable English skills line in the synthetic clean-image fixture.

**How to apply:** Keep clean-image phrase assertions when changing OCR orientation handling; do not assume enabling every box rotation improves accuracy.

Use a PDF.js build whose browser compatibility matches the preview browser, including its worker.

**Why:** PDF.js 6's modern build could extract selectable text but failed only during scanned-page rendering because the browser lacked Map.getOrInsertComputed. The supported legacy distribution supplies compatibility polyfills.

**How to apply:** A successful selectable-text import does not verify the rendering path; preserve a scanned/mixed-PDF browser regression when upgrading PDF.js.
