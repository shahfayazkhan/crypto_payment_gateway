import { AuditLog } from '../models/index.js';

export function audit(actor, action, entity, entityId, meta = {}, ip) {
  return AuditLog.create({
    actor: actor?._id || actor?.sub, actorEmail: actor?.email, action, entity, entityId: String(entityId ?? ''), meta, ip,
  }).catch(() => {});
}
