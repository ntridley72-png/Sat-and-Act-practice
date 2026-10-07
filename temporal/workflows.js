/* FunSAT operations workflows. Runs in the Temporal deterministic sandbox:
   only activities talk to the outside world. */
const { proxyActivities } = require("@temporalio/workflow");

const { seoAuditActivity, indexNowActivity } = proxyActivities({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 2 },
});

/* Weekly SEO job: verify the generated site passes the audit, then submit any
   new or changed canonical URLs to IndexNow. Never submits if the audit fails. */
async function seoIndexingWorkflow() {
  const audit = await seoAuditActivity();
  if (!audit.ok) return { status: "blocked-by-audit", audit: audit.summary };
  const submission = await indexNowActivity();
  return {
    status: submission.ok ? "ok" : "submission-failed",
    audit: audit.summary,
    indexnow: submission.summary,
  };
}

module.exports = { seoIndexingWorkflow };
