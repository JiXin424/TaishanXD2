// 001_create_indexes.js
// MongoDB 索引初始化 — 2026-05-11
// 对应 Go 代码: server/internal/repository/mongo.go → CreateIndexes()

// ── Companies ──────────────────────────────────────────────────
db.companies.createIndex(
  { code: 1 },
  { name: "code_unique", unique: true }
);

// ── Organizations ──────────────────────────────────────────────
db.organizations.createIndex(
  { companyId: 1, path: 1 },
  { name: "company_path" }
);
db.organizations.createIndex(
  { parentId: 1 },
  { name: "parent" }
);
db.organizations.createIndex(
  { companyId: 1, level: 1 },
  { name: "company_level" }
);

// ── Users ──────────────────────────────────────────────────────
db.users.createIndex(
  { companyId: 1, status: 1 },
  { name: "company_status" }
);
db.users.createIndex(
  { "channelBindings.platform": 1, "channelBindings.platformUserId": 1 },
  { name: "channel_binding" }
);
db.users.createIndex(
  { phone: 1 },
  { name: "phone_sparse", sparse: true }
);
db.users.createIndex(
  { email: 1 },
  { name: "email_sparse", sparse: true }
);

// ── Positions ──────────────────────────────────────────────────
db.positions.createIndex(
  { userId: 1, isLeader: 1 },
  { name: "user_leader" }
);
db.positions.createIndex(
  { orgNodeId: 1 },
  { name: "org_node" }
);
db.positions.createIndex(
  { companyId: 1, orgNodePath: 1 },
  { name: "company_path" }
);
db.positions.createIndex(
  { orgNodePath: 1 },
  { name: "path_prefix" }
);

// ── Analysis Logs ─────────────────────────────────────────────
db.analysis_logs.createIndex(
  { appId: 1, companyId: 1 },
  { name: "app_company" }
);
db.analysis_logs.createIndex(
  { createdAt: -1 },
  { name: "created_at" }
);
