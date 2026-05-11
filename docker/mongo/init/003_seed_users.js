// 003_seed_users.js
// 种子数据 — 超级管理员 — 2026-05-11
// 账号 admin，密码 admin（bcrypt 哈希）

var now = new Date();

db.users.insertOne({
  _id: ObjectId(),
  username: "admin",
  passwordHash: "$2a$10$kFQDmXKgs7dntUGV9Ib7/.KqciU7SjmftAZKgTGP8xsFv3kK0cRfC",
  role: "super_admin",
  name: "超级管理员",
  phone: "",
  email: "admin@taishanxd.com",
  avatar: "",
  status: "active",
  channelBindings: [],
  createdAt: now,
  updatedAt: now,
});
