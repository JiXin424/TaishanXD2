// 002_seed_companies.js
// 种子数据 — 默认公司 — 2026-05-07

var now = new Date();

db.companies.insertMany([
  {
    _id: ObjectId(),
    name: "福多多",
    code: "fuduoduo",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: ObjectId(),
    name: "泰山兄弟",
    code: "tsxd",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: ObjectId(),
    name: "九峰",
    code: "jiufeng_simple",
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
]);
