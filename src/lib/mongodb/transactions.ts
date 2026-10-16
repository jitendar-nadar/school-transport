import mongoose, { type ClientSession, type Model } from "mongoose";

/* eslint-disable @typescript-eslint/no-explicit-any -- See registerModel. */
export async function withOptionalTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("replica set") || message.includes("Transaction numbers")) {
      return work(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function createOne(model: Model<any>, doc: Record<string, unknown>, session: ClientSession | null) {
  if (session) {
    const created = await model.create([doc], { session });
    return created[0];
  }
  return model.create(doc);
}
