// 004_seed_organizations.js
// 种子数据 — 福多多公司组织架构 — 2026-05-11
// 结构：福多多(根) → 华东分公司 → 销售部
//                           → 华南分公司

var now = new Date();

var company = db.companies.findOne({ code: "fuduo" });
if (!company) {
  print("WARNING: 福多多公司未找到，跳过组织架构种子数据");
  quit();
}

// 根节点
var root = db.organizations.insertOne({
  _id: ObjectId(),
  companyId: company._id,
  name: "福多多",
  parentId: null,
  path: "",
  level: 0,
  order: 0,
  status: "active",
  createdAt: now,
  updatedAt: now,
});
var rootId = root.insertedId;
db.organizations.updateOne(
  { _id: rootId },
  { $set: { path: rootId.toString() } }
);

// 华东分公司
var huadong = db.organizations.insertOne({
  _id: ObjectId(),
  companyId: company._id,
  name: "华东分公司",
  parentId: rootId,
  path: "",
  level: 1,
  order: 0,
  status: "active",
  createdAt: now,
  updatedAt: now,
});
var huadongId = huadong.insertedId;
db.organizations.updateOne(
  { _id: huadongId },
  { $set: { path: rootId.toString() + "." + huadongId.toString() } }
);

// 华南分公司
var huanan = db.organizations.insertOne({
  _id: ObjectId(),
  companyId: company._id,
  name: "华南分公司",
  parentId: rootId,
  path: "",
  level: 1,
  order: 0,
  status: "active",
  createdAt: now,
  updatedAt: now,
});
var huananId = huanan.insertedId;
db.organizations.updateOne(
  { _id: huananId },
  { $set: { path: rootId.toString() + "." + huananId.toString() } }
);

// 销售部（隶属于华东分公司）
var xiaoshou = db.organizations.insertOne({
  _id: ObjectId(),
  companyId: company._id,
  name: "销售部",
  parentId: huadongId,
  path: "",
  level: 2,
  order: 0,
  status: "active",
  createdAt: now,
  updatedAt: now,
});
var xiaoshouId = xiaoshou.insertedId;
db.organizations.updateOne(
  { _id: xiaoshouId },
  {
    $set: {
      path:
        rootId.toString() +
        "." +
        huadongId.toString() +
        "." +
        xiaoshouId.toString(),
    },
  }
);
