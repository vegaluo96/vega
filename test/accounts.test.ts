// P1 身份/账号层（node:sqlite）：注册/登录/会话/角色/额度/充值/封禁/邮箱验证。
// 与神圣日志无关——纯边缘基础设施，用内存库测。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../src/platform/accounts.ts';

test('注册 + 登录 + 会话鉴权：口令用 scrypt、令牌可解析回账号', () => {
  const s = createAccountStore(':memory:');
  try {
    const r = s.register('Tam@Koreamail.com', 'a-good-pass', 'Tam');
    assert.ok(r.ok && r.account.email === 'tam@koreamail.com' && r.account.handle === 'Tam');
    assert.equal(r.ok && r.account.role, 'user');

    assert.equal(s.register('tam@koreamail.com', 'another', 'x').ok, false, '重复邮箱应拒');
    assert.equal(s.register('bad', 'short', 'x').ok, false, '坏邮箱应拒');
    assert.equal(s.register('ok@x.com', 'short', 'x').ok, false, '弱密码应拒');

    const bad = s.login('tam@koreamail.com', 'wrong-pass');
    assert.equal(bad.ok, false, '错密码登录失败');
    const good = s.login('TAM@koreamail.com', 'a-good-pass'); // 邮箱大小写不敏感
    assert.ok(good.ok && good.token.length > 0);

    const acct = s.authenticate(good.ok ? good.token : '');
    assert.ok(acct && acct.email === 'tam@koreamail.com', '会话令牌解析回本人');
    assert.equal(s.authenticate('garbage-token'), null);
  } finally {
    s.close();
  }
});

test('注册初始额度：starterOverride 覆盖默认（负/非法回落默认）', () => {
  const s = createAccountStore(':memory:', { starterCredits: 100 });
  try {
    const a = s.register('a@x.com', 'password1', 'a');           // 默认 100
    assert.ok(a.ok && s.balance(a.account.id) === 100);
    const b = s.register('b@x.com', 'password1', 'b', 250);      // 覆盖 250
    assert.ok(b.ok && s.balance(b.account.id) === 250);
    const c = s.register('c@x.com', 'password1', 'c', -5);       // 负数无效 → 回落默认
    assert.ok(c.ok && s.balance(c.account.id) === 100);
    const d = s.register('d@x.com', 'password1', 'd', 0);        // 0 合法 = 不送额度
    assert.ok(d.ok && s.balance(d.account.id) === 0);
  } finally {
    s.close();
  }
});

test('角色：owner/steward 由 env 白名单授予（大小写不敏感），其余为 user', () => {
  const s = createAccountStore(':memory:', { owners: ['Boss@x.com'], stewards: ['mod@x.com'] });
  try {
    const boss = s.register('boss@x.com', 'password1', 'boss');
    assert.equal(boss.ok && boss.account.role, 'owner', '白名单邮箱→owner');
    const mod = s.register('mod@x.com', 'password1', 'm');
    assert.equal(mod.ok && mod.account.role, 'steward');
    const plain = s.register('someone@x.com', 'password1', 's');
    assert.equal(plain.ok && plain.account.role, 'user', '非白名单→user');
  } finally {
    s.close();
  }
});

test('登出 + 封禁：令牌失效、封禁即踢下线且登录被拒', () => {
  const s = createAccountStore(':memory:');
  try {
    s.register('u@x.com', 'password1', 'u');
    const l = s.login('u@x.com', 'password1');
    const token = l.ok ? l.token : '';
    assert.ok(s.authenticate(token));
    s.logout(token);
    assert.equal(s.authenticate(token), null, '登出后令牌失效');

    const l2 = s.login('u@x.com', 'password1');
    const t2 = l2.ok ? l2.token : '';
    const uid = (l2.ok ? l2.account.id : '');
    s.setStatus(uid, 'blocked');
    assert.equal(s.authenticate(t2), null, '封禁即踢下线');
    assert.equal(s.login('u@x.com', 'password1').ok, false, '封禁后登录被拒');
  } finally {
    s.close();
  }
});

test('额度：起始额度 + 扣费(不足返 false 不阻断) + 充值审批入账', () => {
  const s = createAccountStore(':memory:', { starterCredits: 50 });
  try {
    const r = s.register('p@x.com', 'password1', 'p');
    const uid = r.ok ? r.account.id : '';
    assert.equal(s.balance(uid), 50, '新用户拿到起始额度');

    assert.equal(s.debit(uid, 30, 'model_call'), true);
    assert.equal(s.balance(uid), 20);
    assert.equal(s.debit(uid, 999, 'model_call'), false, '余额不足扣费返回 false（调用方回退模板嘴）');
    assert.equal(s.balance(uid), 20, '失败的扣费不动余额');

    const reqId = s.requestRecharge(uid, 100);
    assert.equal(s.pendingRecharges().length, 1);
    assert.equal(s.decideRecharge(reqId, true, 'owner@x.com'), true);
    assert.equal(s.balance(uid), 120, '审批通过后额度入账');
    assert.equal(s.pendingRecharges().length, 0);
    assert.equal(s.decideRecharge(reqId, true, 'owner@x.com'), false, '已决的申请不能重复处理');
  } finally {
    s.close();
  }
});

test('relationship_id：user → u_<id>（日志只见这个、不存 PII）', () => {
  const s = createAccountStore(':memory:');
  try {
    const r = s.register('priv@x.com', 'password1', 'priv');
    const uid = r.ok ? r.account.id : '';
    assert.equal(s.relIdFor(uid), `u_${uid}`);
    assert.ok(!s.relIdFor(uid).includes('@'), 'relationship_id 不含邮箱/PII');
  } finally {
    s.close();
  }
});

test('邮箱验证：令牌一次性、可标记已验证', () => {
  const s = createAccountStore(':memory:');
  try {
    const r = s.register('v@x.com', 'password1', 'v');
    const uid = r.ok ? r.account.id : '';
    assert.equal(r.ok && r.account.emailVerified, false);
    const token = s.issueEmailVerification(uid);
    assert.equal(s.verifyEmail('wrong'), false);
    assert.equal(s.verifyEmail(token), true);
    assert.equal(s.getAccount(uid)?.emailVerified, true);
    assert.equal(s.verifyEmail(token), false, '令牌一次性');
  } finally {
    s.close();
  }
});

test('持久化：落盘后重开库，账号与额度还在（她不在意，但平台账号要稳）', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'vega-acct-'));
  const path = join(dir, 'accounts.db');
  try {
    const s1 = createAccountStore(path, { starterCredits: 10 });
    const r = s1.register('persist@x.com', 'password1', 'p');
    const uid = r.ok ? r.account.id : '';
    s1.credit(uid, 5, 'bonus');
    s1.close();

    const s2 = createAccountStore(path);
    assert.ok(s2.getAccount(uid), '重开库账号还在');
    assert.equal(s2.balance(uid), 15, '额度持久');
    assert.ok(s2.login('persist@x.com', 'password1').ok, '重开库仍可登录');
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('微信绑定(§12)：一次性令牌 → openid↔user↔life；可解析、可改绑、可解绑', () => {
  const s = createAccountStore(':memory:');
  try {
    const r = s.register('w@x.com', 'password1', 'W');
    const uid = r.ok ? r.account.id : '';
    const token = s.createBindToken(uid, 'vega');
    assert.equal(s.resolveWechat('openid_123'), null, '绑定前解析为空');
    // clawbot 拿 openid 完成绑定
    const bound = s.bindWechat(token, 'openid_123');
    assert.deepEqual(bound, { userId: uid, lifeId: 'vega' });
    assert.deepEqual(s.resolveWechat('openid_123'), { userId: uid, lifeId: 'vega' }, '之后 openid 能解析回 user+life');
    // 令牌一次性
    assert.equal(s.bindWechat(token, 'openid_other'), null, '绑定令牌一次性');
    // 改绑到另一条命
    const t2 = s.createBindToken(uid, 'lyra');
    s.bindWechat(t2, 'openid_123');
    assert.equal(s.resolveWechat('openid_123')?.lifeId, 'lyra', '同一 openid 可改绑');
    // 解绑
    s.unbindWechat('openid_123');
    assert.equal(s.resolveWechat('openid_123'), null);
  } finally {
    s.close();
  }
});

test('管理后台元数据：listUsers（含余额、无口令） + pendingRechargeCount', () => {
  const s = createAccountStore(':memory:', { starterCredits: 20 });
  try {
    s.register('a@x.com', 'password1', 'A');
    const b = s.register('b@x.com', 'password1', 'B');
    const uid = b.ok ? b.account.id : '';
    s.requestRecharge(uid, 100);
    s.requestRecharge(uid, 200);
    const users = s.listUsers();
    assert.equal(users.length, 2);
    assert.equal(users[0].balance, 20, '列表带余额');
    assert.ok(!('pass_hash' in users[0]) && !('pass_salt' in users[0]), '绝不带口令哈希');
    assert.equal(s.pendingRechargeCount(), 2);
    s.decideRecharge(s.pendingRecharges()[0].id, true, 'owner');
    assert.equal(s.pendingRechargeCount(), 1, '审批一个后剩一个');
  } finally {
    s.close();
  }
});

test('角色提升：先注册（user）→ 后加 VEGA_OWNERS → 下次登录自动升 owner', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'vega-role-'));
  const path = join(dir, 'a.db');
  try {
    // 没有白名单时注册 → user
    const s1 = createAccountStore(path);
    const r = s1.register('me@x.com', 'password1', 'me');
    assert.equal(r.ok && r.account.role, 'user');
    s1.close();
    // 重开库、这次把该邮箱加进 owners → 登录即升 owner
    const s2 = createAccountStore(path, { owners: ['me@x.com'] });
    const l = s2.login('me@x.com', 'password1');
    assert.equal(l.ok && l.account.role, 'owner', '登录后自动升 owner');
    assert.equal(s2.authenticate(l.ok ? l.token : '')?.role, 'owner', '会话也是 owner');
    s2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('关注：toggle/查存在/我关注的(最近在前)/粉丝数，纯平台层不碰引擎', () => {
  const s = createAccountStore(':memory:');
  try {
    const u = s.register('u@x.com', 'password1', 'u');
    const v = s.register('v@x.com', 'password1', 'v');
    assert.ok(u.ok && v.ok);
    const uid = u.ok ? u.account.id : '', vid = v.ok ? v.account.id : '';
    // 初始：没关注谁、谁也没粉丝
    assert.equal(s.isFollowing(uid, 'vega'), false);
    assert.deepEqual(s.followsOf(uid), []);
    assert.equal(s.followerCount('vega'), 0);
    // 关注 vega、再关注 lyra → 最近关注在前
    s.follow(uid, 'vega');
    s.follow(uid, 'lyra');
    assert.equal(s.isFollowing(uid, 'vega'), true);
    assert.deepEqual(s.followsOf(uid), ['lyra', 'vega'], '最近关注在前');
    // 幂等：重复关注不报错、不重复
    s.follow(uid, 'vega');
    assert.deepEqual(s.followsOf(uid).sort(), ['lyra', 'vega']);
    // 粉丝数跨用户聚合：u、v 都关注 vega → 2
    s.follow(vid, 'vega');
    assert.equal(s.followerCount('vega'), 2);
    assert.equal(s.followerCount('lyra'), 1);
    // 取关只动自己这段，不影响别人
    s.unfollow(uid, 'vega');
    assert.equal(s.isFollowing(uid, 'vega'), false);
    assert.equal(s.isFollowing(vid, 'vega'), true, '别人对 vega 的关注不受影响');
    assert.equal(s.followerCount('vega'), 1);
    assert.deepEqual(s.followsOf(uid), ['lyra']);
  } finally {
    s.close();
  }
});

test('审计留痕（服务端持久化）：addAudit 落库、listAudit 倒序 + limit', () => {
  const s = createAccountStore(':memory:');
  try {
    s.addAudit('owner', '查看对话全文 vega ↔ Tam（理由：安全审查）');
    s.addAudit('steward', '停用账户 x');
    s.addAudit('owner', '保存计费配置（每条 2 心意 · 初始 50）');
    const rows = s.listAudit(10);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].who, 'owner', '倒序：最新在前');
    assert.ok(rows[0].action.includes('计费'));
    assert.ok(rows[2].action.includes('理由：安全审查'), '查看理由随留痕持久化');
    assert.equal(s.listAudit(2).length, 2, 'limit 生效');
  } finally {
    s.close();
  }
});

test('流水账本查询：listLedger 带昵称倒序、可按用户过滤；spendByLife 按命聚合 model−refund', () => {
  const s = createAccountStore(':memory:', { starterCredits: 10 });
  try {
    const u = s.register('u@x.com', 'password1', 'Tam');
    const v = s.register('v@x.com', 'password1', 'Vis');
    const uid = u.ok ? u.account.id : '', vid = v.ok ? v.account.id : '';
    s.debit(uid, 1, 'model', 'vega');
    s.debit(uid, 1, 'model', 'vega');
    s.debit(uid, 1, 'model', 'lyra');
    s.credit(uid, 1, 'refund', 'lyra'); // lyra 那轮失败退回 → 净消耗 0
    s.debit(vid, 1, 'model', 'vega');
    const all = s.listLedger(50);
    assert.equal(all.length, 7, '2 笔 starter + 4 笔 model + 1 笔 refund');
    assert.equal(all[0].reason, 'model', '倒序：最新在前');
    assert.equal(all[0].handle, 'Vis', 'JOIN 出昵称');
    const mine = s.listLedger(50, uid);
    assert.ok(mine.every((r) => r.userId === uid), '按用户过滤');
    assert.equal(mine.length, 5);
    const by = s.spendByLife(7);
    assert.deepEqual(by[0], { life: 'vega', spent: 3, replies: 3 }, 'vega 净消耗 3');
    const lyra = by.find((r) => r.life === 'lyra');
    assert.deepEqual(lyra, { life: 'lyra', spent: 0, replies: 1 }, 'refund 抵回：lyra 净消耗 0');
  } finally {
    s.close();
  }
});

test('对话标记：set 可升级覆盖（upsert）、clear 删除、listConvoFlags/convoFlagsFor 查询', () => {
  const s = createAccountStore(':memory:');
  try {
    s.setConvoFlag('vega', 'u_1', 'watch', '言语越界', 'owner');
    s.setConvoFlag('lyra', 'u_2', 'blocked', '安全词「自杀」', 'safety');
    assert.equal(s.listConvoFlags().length, 2);
    assert.equal(s.convoFlagsFor('vega').length, 1);
    assert.equal(s.convoFlagsFor('vega')[0].flag, 'watch');
    // 同一对话再标 → 覆盖不重复（主键 life+rel）
    s.setConvoFlag('vega', 'u_1', 'blocked', '升级拦截', 'owner');
    assert.equal(s.convoFlagsFor('vega').length, 1);
    assert.equal(s.convoFlagsFor('vega')[0].flag, 'blocked');
    assert.equal(s.convoFlagsFor('vega')[0].reason, '升级拦截');
    s.clearConvoFlag('vega', 'u_1');
    assert.equal(s.convoFlagsFor('vega').length, 0);
    assert.equal(s.listConvoFlags().length, 1, '别的命的标记不受影响');
  } finally {
    s.close();
  }
});

test('安全拦截记录：落库倒序可查；超 180 天的旧记录在新插入时被清理', () => {
  const s = createAccountStore(':memory:');
  try {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString(); // 200 天前（注入时刻，过期）
    s.addSafetyHit('vega', 'u_1', '自杀', '接管话术', '我想自杀', old);
    s.addSafetyHit('vega', 'u_1', '自残', '接管话术', '想自残');
    const rows = s.listSafetyHits(10);
    assert.equal(rows.length, 1, '过期记录被 180 天保留期清掉');
    assert.equal(rows[0].word, '自残');
    assert.equal(rows[0].lifeId, 'vega');
    assert.equal(rows[0].rel, 'u_1');
  } finally {
    s.close();
  }
});

test('充值已处理历史：全局倒序、带昵称与经手人；待审不混入', () => {
  const s = createAccountStore(':memory:', { starterCredits: 0 });
  try {
    const u = s.register('u@x.com', 'password1', 'Tam');
    const uid = u.ok ? u.account.id : '';
    const a = s.requestRecharge(uid, 100);
    const b = s.requestRecharge(uid, 50);
    s.requestRecharge(uid, 30); // 留一笔待审
    s.decideRecharge(a, true, 'owner@x');
    s.decideRecharge(b, false, 'owner@x');
    const rows = s.decidedRecharges(10);
    assert.equal(rows.length, 2, '只含已处理，待审不混入');
    assert.equal(rows[0].handle, 'Tam');
    assert.equal(rows[0].decidedBy, 'owner@x');
    assert.ok(rows.some((r) => r.status === 'approved' && r.amount === 100));
    assert.ok(rows.some((r) => r.status === 'rejected' && r.amount === 50));
  } finally {
    s.close();
  }
});
