const { Worker, NativeConnection } = require("@temporalio/worker");
const activities = require("./activities");

async function main() {
  const connection = await NativeConnection.connect({ address: "localhost:7233" });
  const worker = await Worker.create({
    connection,
    namespace: "default",
    taskQueue: "funsat-ops",
    workflowsPath: require.resolve("./workflows"),
    activities,
  });
  console.log("funsat-temporal worker started on task queue funsat-ops");
  await worker.run();
}

main().catch((err) => { console.error("worker failed:", err); process.exit(1); });
