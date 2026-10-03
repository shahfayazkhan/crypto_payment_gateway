/** ?page=1&limit=25 → { items, total, page, limit } */
export async function paginate(Model, filter, req, { sort = { createdAt: -1 }, populate } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  let q = Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean(), Model.countDocuments(filter)]);
  return { items, total, page, limit };
}
