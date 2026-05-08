// 003_seed_users_tsxd.js
// 种子数据 — 超级管理员 + 泰山兄弟公司 13 名用户 — 2026-05-07
// 账号名 Ts-{名字拼音首字母}，密码与账号相同（bcrypt 哈希）
// 对应 PostgreSQL wecom_users 的 13 条记录

var now = new Date();

// 泰山兄弟公司 ID (动态查找，依赖 002_seed_companies.js 先执行)
var company = db.companies.findOne({ code: "tsxd" });

// ── 超级管理员 ──────────────────────────────────────────────────
db.users.insertOne({
  _id: ObjectId(),
  companyId: company._id,
  username: "admin",
  passwordHash: "$2a$10$zN9P.O6U9eYZHViLPVJQzuB8vQ7l0K3xR5nG2mDwF4bH8jKlMnOp",
  role: "super_admin",
  name: "超级管理员",
  phone: "",
  email: "admin@taishanxd.com",
  avatar: "",
  status: "active",
  channelBindings: [],
  createdAt: now,
  updatedAt: now
});

db.users.insertMany([
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-cl",
    passwordHash: "$2a$10$wIGj6tFWEBFtV9BCBRV4ieG7CxY.IUZwfkBnIx0/LnA.d6Hlsl/cG",
    name: "陈亮",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "ChenLiang", platformUserName: "陈亮", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-sh",
    passwordHash: "$2a$10$UpDGqLkXM09Sl/G.oDrM2.zbFNGf8SmQmSqe80FOswsRFboXmwakC",
    name: "斯珩",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "SiHeng", platformUserName: "斯珩", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-hxn",
    passwordHash: "$2a$10$9x9wX6Kjbb7PnDxmNvLpzOalBHn2T8yYZFnMJhsabtx5.MhuXjyYa",
    name: "黄小楠",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "HuangXiaoNan", platformUserName: "黄小楠", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-wd",
    passwordHash: "$2a$10$ogqlW3DB8OOkMJNEVERTmO5Kkg.sDOp1/Ue/gDhx/PgS34I4/HgD6",
    name: "王笛Winnie",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "WangDiwinnie", platformUserName: "王笛Winnie", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-lgx",
    passwordHash: "$2a$10$1YglcAnAiu7UCUhedw.fJ.dwUBDfmd3qPLlBUYMZUl/6Fcrx6ldBq",
    name: "李桂秀",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "lmfan", platformUserName: "李桂秀", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-gtj",
    passwordHash: "$2a$10$MDHbr.yhFU8WxOQFanTcA.zVOvTI6/U0NVO1qQtiNtKLUHLpDS7Gq",
    name: "郭彤佳",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "GuoTongJia", platformUserName: "郭彤佳", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-yw",
    passwordHash: "$2a$10$U148smQV0f.qRK1BN9vjsugGyRCTvN3anjyHf2yvrUpbQc4dLTst6",
    name: "永维",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "YongWei", platformUserName: "永维", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-hdzw",
    passwordHash: "$2a$10$LCO.SfwICSszqNZbtFLiSOsOD6.bfHqAP9hzvs5bP/9ovkP.qwTE2",
    name: "厚德载物",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "HouDeZaiWu", platformUserName: "厚德载物", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-jx",
    passwordHash: "$2a$10$Sa9wkzmDIimpNiyZWHMpe.l7./9mIaenr5W.rDcsvH6849VI00m9m",
    name: "菠c美式",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "BocMeiShi", platformUserName: "菠c美式", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-lyw",
    passwordHash: "$2a$10$xUsQuLxWnNuOkaTeaRrBLe6HWg1VUCO.EivMJmWBe9tMm77fNEQvi",
    name: "刘英文",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "LiuYingWen", platformUserName: "刘英文", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-rf",
    passwordHash: "$2a$10$.MVFK80qHnb9RVLW1WEXSehAh4dld4VZuXMl3MMeH9a2JJEEWAm5.",
    name: "Ryan Friedman",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "ryanfriedman", platformUserName: "Ryan Friedman", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-hlf",
    passwordHash: "$2a$10$gmvhMrdOQd1e9bodI5DAaePxKQY5d1pPevlGFZafsef8eeWrC4MmW",
    name: "韩利飞",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "alvis", platformUserName: "韩利飞", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  },
  {
    _id: ObjectId(),
    companyId: company._id,
    username: "Ts-zj",
    passwordHash: "$2a$10$wh4ZrAW2vp8P5qhbgFciguQCIGCtFqUMMK8EDvNTnMyowiC.F1jKy",
    name: "朱振军",
    phone: "",
    email: "",
    avatar: "",
    status: "active",
    channelBindings: [{ platform: "wecom", platformUserId: "ZhuZhenJun", platformUserName: "朱振军", syncedAt: now }],
    createdAt: now,
    updatedAt: now
  }
]);
