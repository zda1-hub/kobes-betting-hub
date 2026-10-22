# Statistics context update — October 21, 2026 MST

Request: implement the reviewed follow-up examples and deploy if quality is adequate. User explicitly authorized this release.

Affected public file: education/mean-versus-median.html only. Added even-sample median calculation, original synthetic shooting-percentage/sample-size example, range FAQ, sample-size contents link and SABR/UNT source references. Preserved shared shell, styling, canonical, metadata and existing routes. No separate keyword page or unverified ranking claim.

Before: guide covered mean/median and an odd-sample outlier example. After: reader can also calculate an even-sample median, see how denominators affect sensitivity to one result, and distinguish range from endpoints. All numbers are labelled synthetic.

Verification: original example 32/4=8, median(4,6)=5; 3/6=50%, 60/101 rounds59.4%;25−2=23. Public build passed; JSON-LD parsed; all contents anchors resolve; one H1 and no noindex. Safari same-origin frames measured viewport/scroll widths320/320,390/390,1440/1440; header top0; checked bounds no overflow. Populated screenshot inspected and new sample-size link clicked at320px. No layout or script changes required. No extra implementation-mirroring tests added for text-only content. Prior test suite covers unchanged internal editorial tooling.

Release status: ready pending deployment/live verification. Keyword demand, ranking movement and index inclusion remain unverified. Earlier Google request confirmed priority crawl queue; repeat submissions are unnecessary. Unrelated dirty audit and preview files preserved. Internal measurement-log updates remain local and excluded from deployment.
