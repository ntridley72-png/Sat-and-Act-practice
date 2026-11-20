pdf.js (pdfjs-dist 4.10.38, legacy build), Apache-2.0, Mozilla Foundation. Vendored unmodified so a
student's score-report PDF is read inside their own browser and never uploaded anywhere.
Loaded lazily by score-report.js only when a PDF is chosen. 4.10.38 includes the fix for CVE-2024-4367
(fixed upstream in 4.2.67); score-report.js also passes isEvalSupported:false.
