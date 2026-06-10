// 后台会话侧信息：管理员身份（侧栏底部用）+ 待审批角标 + 本地审计占位。
// 身份来自登录响应的 account（owner/steward 才放行）；token 本身仍由 api.js 的 session 管。
import { writable } from 'svelte/store';

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

// —— 本地审计占位 ——
// TODO(后端)：审计日志列表接口暂无。敏感操作（查看对话全文/停用账户/余额调整/全站配置变更）
// 先在前端留痕展示（System 视图「审计日志」卡），后端接口就绪后切到真实数据、并把理由/备注作为参数上送。
const AUDIT_KEY = 'zsky_admin_audit';
function readAudit() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}
export const audit = writable(readAudit());
export function addAudit(act) {
  audit.update((rows) => {
    const next = [{ t: new Date().toISOString(), who: readMe().handle || 'admin', act }, ...rows].slice(0, 100);
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
}

// 401 才退出登录；403 只是该账号权限不够（steward 看 owner-only），不应整体踢出。
import { clearSession } from './api.js';
export function authGuard(e) { if (e && e.status === 401) { clearSession(); setMe(null); } }
