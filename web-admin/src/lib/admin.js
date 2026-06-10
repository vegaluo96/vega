// 后台会话侧信息：管理员身份（侧栏底部用）+ 待审批角标 + 审计留痕上送。
// 身份来自登录响应的 account（owner/steward 才放行）；token 本身仍由 api.js 的 session 管。
import { writable } from 'svelte/store';
import { api, clearSession } from './api.js';

const ME_KEY = 'zsky_admin_me';

function readMe() {
  try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null') || { handle: '', role: '' }; }
  catch { return { handle: '', role: '' }; }
}
export const me = writable(readMe());
export function setMe(m) {
  me.set(m || { handle: '', role: '' });
  try { m ? localStorage.setItem(ME_KEY, JSON.stringify(m)) : localStorage.removeItem(ME_KEY); } catch { /* ignore */ }
}

// 侧栏角标 = 待审批充值数（Shell 轮询 overview 刷新；审批页处理后即时减）。
export const pendingCount = writable(0);

// —— 审计留痕（服务端持久化：POST /admin/audit）——
// 敏感操作（查看对话全文/停用账户/余额调整/全站配置变更/标记/安全配置）大多由后端 handler 自记；
// addAudit 只补录"后端接口尚未覆盖"的前端动作（占位功能的操作意向等）。上送失败静默——留痕绝不阻断操作。
// System 视图「审计日志」直接读 GET /admin/audit。
export function addAudit(act) { api.addAudit(act).catch(() => { /* 留痕失败不阻断操作 */ }); }

// 401 才退出登录；403 只是该账号权限不够（steward 看 owner-only），不应整体踢出。
export function authGuard(e) { if (e && e.status === 401) { clearSession(); setMe(null); } }
