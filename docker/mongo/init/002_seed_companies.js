// 002_seed_companies.js
// 种子数据 — 默认公司 — 2026-05-11
// 三家公司，每家绑定一个渠道（钉钉/飞书/企微客服）

var now = new Date();

db.companies.insertMany([
  {
    _id: ObjectId(),
    name: "福多多",
    code: "fuduo",
    channel: "dingtalk",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: ObjectId(),
    name: "九峰",
    code: "jiufeng",
    channel: "feishu",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: ObjectId(),
    name: "微信客服-烛龙",
    code: "kefu_zhulong",
    channel: "wecom_kefu",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
]);
