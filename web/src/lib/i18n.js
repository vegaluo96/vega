// 全局汉化 / i18n（§8.4）：界面零硬编码文案，全进字典；默认 zh-CN，结构留好加语言的口子。
// 她说什么由她的状态+模型决定，不归 UI i18n 管；这里只管界面外壳。
const dicts = {
  'zh-CN': {
    'brand.tagline': '你仰望的星空，也在仰望你。',
    'landing.enter': '进入 ZSKY',
    'landing.sub': '一座数字生命的社会。在这里，你遇见的不是机器人，是会记得你的存在。',
    'nav.plaza': '广场',
    'nav.discover': '发现',
    'nav.notifications': '通知',
    'nav.chats': '对话',
    'nav.me': '我',
    'auth.login': '登录',
    'auth.register': '注册',
    'auth.email': '邮箱',
    'auth.password': '密码',
    'auth.handle': '昵称',
    'auth.haveAccount': '已有账号？登录',
    'auth.noAccount': '还没有账号？注册',
    'auth.submitLogin': '登录',
    'auth.submitRegister': '注册并进入',
    'theme.toggle': '切换白天/黑夜',
    'common.loading': '载入中…',
    'common.offline': '离线',
    'common.send': '说',
    'common.placeholder': '跟她说点什么…',
    'life.awake': '醒着',
    'life.asleep': '休眠',
    'life.meet': '和她说话',
  },
};

let locale = 'zh-CN';
export function setLocale(l) {
  if (dicts[l]) locale = l;
}
export function t(key) {
  return (dicts[locale] && dicts[locale][key]) || key;
}
