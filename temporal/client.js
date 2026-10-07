const { Connection, Client, ScheduleOverlapPolicy } = require("@temporalio/client");

const TASK_QUEUE = "funsat-ops";
const SCHEDULE_ID = "funsat-weekly-indexing";

async function withClient(fn) {
  const connection = await Connection.connect({ address: "localhost:7233" });
  const client = new Client({ connection, namespace: "default" });
  try { await fn(client); } finally { await connection.close(); }
}

async function run() {
  await withClient(async (client) => {
    const handle = await client.workflow.start("seoIndexingWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId: "seo-indexing-" + Date.now(),
    });
    console.log("started", handle.workflowId);
    const result = await handle.result();
    console.log(JSON.stringify(result, null, 2));
  });
}

async function schedule() {
  await withClient(async (client) => {
    try {
      await client.schedule.create({
        scheduleId: SCHEDULE_ID,
        spec: { intervals: [{ every: "7 days" }] },
        policies: { overlap: ScheduleOverlapPolicy.SKIP },
        action: {
          type: "startWorkflow",
          workflowType: "seoIndexingWorkflow",
          taskQueue: TASK_QUEUE,
          workflowId: "seo-indexing-scheduled",
        },
      });
      console.log("created schedule", SCHEDULE_ID, "(every 7 days, overlap skipped)");
    } catch (err) {
      if (String(err).includes("already exists")) { console.log("schedule already exists:", SCHEDULE_ID); return; }
      throw err;
    }
  });
}

async function schedules() {
  await withClient(async (client) => {
    for await (const s of client.schedule.list()) {
      const desc = typeof s.describe === "function" ? await s.describe() : s;
      const spec = desc.spec || {};
      console.log((desc.scheduleId || s.scheduleId || "?"), "| every:", JSON.stringify(spec.intervals || spec.cronExpressions || []));
    }
  });
}

const cmd = process.argv[2];
const table = { run, schedule, schedules };
if (!table[cmd]) { console.error("usage: node client.js run|schedule|schedules"); process.exit(2); }
table[cmd]().catch((err) => { console.error(err); process.exit(1); });
