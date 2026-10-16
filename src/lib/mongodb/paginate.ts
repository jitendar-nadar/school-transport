import type { Model } from "mongoose";
import type { PageMeta } from "@/types/domain";

/* eslint-disable @typescript-eslint/no-explicit-any -- See registerModel. */
export async function paginate(
  model: Model<any>,
  filter: Record<string, unknown>,
  options: {
    page: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
    populate?: string | Array<{ path: string; select?: string }>;
  },
) {
  const skip = (options.page - 1) * options.limit;
  let query = model.find(filter).sort(options.sort ?? { createdAt: -1 }).skip(skip).limit(options.limit);
  if (options.populate) {
    query = query.populate(options.populate as never);
  }
  const [items, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  const meta: PageMeta = {
    page: options.page,
    limit: options.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.limit)),
  };
  return { items, meta };
}
