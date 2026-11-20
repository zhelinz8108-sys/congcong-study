export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" && !process.env.PGOPTIONS?.includes("default_transaction_read_only=on")) {
    const { startDeliveryWorker } = await import("./server/dot/worker");
    startDeliveryWorker();
  }
}
