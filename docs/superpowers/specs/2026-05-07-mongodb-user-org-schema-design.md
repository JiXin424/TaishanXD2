# MongoDB 用户与组织架构 Schema 设计

日期：2026-05-07

## 背景

TaishanXD V2 平台需要一套独立的用户和组织架构管理系统。现有 PostgreSQL 主要存储第三方渠道数据（钉钉、飞书、企业微信），平台自身产生的数据写入 MongoDB 以实现解耦。

### 核心需求

1. 多公司服务，每个公司组织架构不同
2. 动态层级深度（不固定层级数）
3. 一个用户可持有多个职位（跨部门/跨分公司）
4. 登录后只能看到管辖范围内的人员
5. 支持两种权限查询：列出管辖人员列表 + 判断能否访问特定用户
6. MongoDB 用户与 PostgreSQL 渠道用户一对多关系

## 设计方案：独立节点 + 物化路径 + 职位表

### 方案选型

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 树形 path | 纯 path，职位嵌入节点 | 查询简单 | 节点移动需更新子节点 |
| B. 嵌套文档 | 公司为大文档，嵌套子树 | 一次读取 | 文档大，更新复杂 |
| **C. 独立节点+职位表** | org 节点独立 + positions 集合 | 灵活、支持多重身份 | 需要 path 冗余 |

选定方案 C。

## 集合设计

### 1. `companies`

```javascript
{
  _id: ObjectId,
  name: "福多多",           // 公司名称
  code: "fuduo",            // 唯一编码
  status: "active",         // active | inactive
  createdAt: ISODate,
  updatedAt: ISODate
}
```

索引：
- `{ code: 1 }` unique

### 2. `organizations`

```javascript
{
  _id: ObjectId,
  companyId: ObjectId,       // 所属公司
  name: "华东分公司",         // 节点名称
  parentId: ObjectId | null, // 父节点，根节点为 null
  path: "aaa.bbb",           // 物化路径（从根到自身的 ObjectId 链）
  level: 1,                  // 层级深度（0=公司根, 1=分公司, 2=部门, 3=小组...）
  order: 1,                  // 同级排序
  status: "active",          // active | inactive
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**path 规则**：
- 根节点（公司级）：`"公司ObjectId的hex字符串"`
- 子节点：`"父path.本节点ObjectId的hex字符串"`
- 查询某节点及其所有子节点：`{ path: /^父path/ }`

**示例——福多多组织架构**：

```
根(福多多)     path="60a1..."          level=0  parentId=null
├── 华东分公司  path="60a1....b2c3"     level=1  parentId=根
│   ├── 销售部  path="60a1....b2c3.d4e5" level=2  parentId=华东
│   └── 技术部  path="60a1....b2c3.f6g7" level=2  parentId=华东
└── 华南分公司  path="60a1....h8i9"     level=1  parentId=根
    ├── 市场部  path="60a1....h8i9.j0k1" level=2  parentId=华南
    └── 运营部  path="60a1....h8i9.l2m3" level=2  parentId=华南
```

索引：
- `{ companyId: 1, path: 1 }`
- `{ parentId: 1 }`
- `{ companyId: 1, level: 1 }`

### 3. `users`

```javascript
{
  _id: ObjectId,
  companyId: ObjectId,          // 所属公司
  name: "张三",                  // 真实姓名
  phone: "13800138000",         // 手机号（可选，登录用）
  email: "zhangsan@fuduo.com",  // 邮箱（可选）
  avatar: "",                   // 头像 URL
  status: "active",             // active | disabled
  channelBindings: [             // 绑定的第三方渠道用户（1:N PostgreSQL）
    {
      platform: "wecom",        // wecom | dingtalk | feishu
      platformUserId: "wx_12345",
      platformUserName: "张三",
      syncedAt: ISODate
    },
    {
      platform: "dingtalk",
      platformUserId: "dt_67890",
      platformUserName: "张三",
      syncedAt: ISODate
    }
  ],
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**与 PostgreSQL 的关系**：
- `channelBindings.platform` + `channelBindings.platformUserId` 对应 PostgreSQL 中 `wecom_users.user_id`、`dingtalk_users.user_id` 等字段
- 读取渠道数据时：先从 MongoDB user 取 channelBinding → 用 platformUserId 去 PostgreSQL 查询

索引：
- `{ companyId: 1, status: 1 }`
- `{ "channelBindings.platform": 1, "channelBindings.platformUserId": 1 }`
- `{ phone: 1 }` sparse（登录用）
- `{ email: 1 }` sparse（登录用）

### 4. `positions`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,            // 关联 user
  companyId: ObjectId,         // 冗余，便于按公司查询
  orgNodeId: ObjectId,         // 关联 organization 节点
  orgNodePath: "60a1....b2c3", // 冗余物化路径，加速管辖范围查询
  title: "分公司总经理",        // 职位名称
  isLeader: true,              // 是否管理者（决定管辖范围）
  status: "active",            // active | inactive
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**`orgNodePath` 冗余说明**：
- positions 中冗余存储 orgNodePath 避免每次查询都 join organizations 表
- 当 organization 节点 path 变更时，需同步更新相关 positions 的 orgNodePath

**特殊人物示例**：

| 人物 | positions | 管辖范围 |
|------|-----------|----------|
| CEO 李总 | `{orgNode: 福多多根, isLeader: true}` | 全公司所有人 |
| 王经理（华东负责人 + 华南市场部领导） | `{orgNode: 华东, isLeader: true}` + `{orgNode: 华南市场部, isLeader: true}` | 华东全部人员 + 华南市场部人员 |
| 赵总（多分公司领导） | `{orgNode: 华东, isLeader: true}` + `{orgNode: 华南, isLeader: true}` | 华东 + 华南全部人员 |
| 小刘（销售部普通员工） | `{orgNode: 销售部, isLeader: false}` | 仅自己 |

索引：
- `{ userId: 1, isLeader: 1 }`
- `{ orgNodeId: 1 }`
- `{ companyId: 1, orgNodePath: 1 }`
- `{ orgNodePath: 1 }`

## 核心查询方案

### 查询 1：获取某用户管辖的所有人员

```javascript
async function getManagedUsers(db, managerId) {
  // 1. 找到所有 leader 职位的 path
  const leaderPositions = await db.collection("positions").find({
    userId: managerId,
    isLeader: true,
    status: "active"
  }).toArray();

  if (leaderPositions.length === 0) return [];

  // 2. 构建前缀匹配条件
  const pathConditions = leaderPositions.map(p => ({
    orgNodePath: new RegExp(`^${p.orgNodePath}`)
  }));

  // 3. 查找管辖范围内所有职位的用户 ID
  const managedUserIds = await db.collection("positions").distinct("userId", {
    $or: pathConditions,
    status: "active"
  });

  // 4. 返回用户列表
  return await db.collection("users").find({
    _id: { $in: managedUserIds }
  }).toArray();
}
```

### 查询 2：判断用户 A 能否访问用户 B

```javascript
async function canAccess(db, managerId, targetUserId) {
  const leaderPositions = await db.collection("positions").find({
    userId: managerId,
    isLeader: true,
    status: "active"
  }).toArray();

  if (leaderPositions.length === 0) return false;

  const targetPositions = await db.collection("positions").find({
    userId: targetUserId,
    status: "active"
  }).toArray();

  // 任一管辖路径是目标用户任一职位路径的前缀
  return leaderPositions.some(lp =>
    targetPositions.some(tp => tp.orgNodePath.startsWith(lp.orgNodePath))
  );
}
```

### 查询 3：获取组织架构树

```javascript
async function getOrgTree(db, companyId) {
  const nodes = await db.collection("organizations").find({
    companyId,
    status: "active"
  }).sort({ level: 1, order: 1 }).toArray();

  // 内存中构建树
  const nodeMap = {};
  const root = [];

  nodes.forEach(node => {
    node.children = [];
    nodeMap[node._id.toString()] = node;
  });

  nodes.forEach(node => {
    if (node.parentId) {
      const parent = nodeMap[node.parentId.toString()];
      if (parent) parent.children.push(node);
    } else {
      root.push(node);
    }
  });

  return root;
}
```

## 数据一致性

### organization 节点变更处理

当 organization 节点的 path 变更（如节点移动）时，需同步：
1. 更新该节点及所有子节点的 `path`
2. 更新所有关联 positions 的 `orgNodePath`

```javascript
async function moveOrgNode(db, nodeId, newParentId) {
  const node = await db.collection("organizations").findOne({ _id: nodeId });
  const newParent = await db.collection("organizations").findOne({ _id: newParentId });
  const newPath = `${newParent.path}.${nodeId.toHexString()}`;
  const oldPath = node.path;

  // 更新所有子节点 path
  await db.collection("organizations").updateMany(
    { path: new RegExp(`^${oldPath}`) },
    [{ $set: { path: { $replaceOne: { input: "$path", find: oldPath, replacement: newPath } } } }]
  ]);

  // 更新所有关联 positions 的 orgNodePath
  await db.collection("positions").updateMany(
    { orgNodePath: new RegExp(`^${oldPath}`) },
    [{ $set: { orgNodePath: { $replaceOne: { input: "$orgNodePath", find: oldPath, replacement: newPath } } } }]
  );
}
```

## 与 PostgreSQL 的数据流

```
┌─────────────────────────────────────────────────────────┐
│                      MongoDB                            │
│  companies ──→ organizations ──→ positions ←── users     │
│                                    │                    │
│                              channelBindings             │
│                                    │                    │
└────────────────────────────────────┼────────────────────┘
                                     │ platformUserId
                                     ▼
┌─────────────────────────────────────────────────────────┐
│                     PostgreSQL                           │
│  wecom_users ─── dingtalk_users ─── feishu_users         │
│  wecom_messages ─ dingtalk_messages ─ feishu_messages    │
│  wecom_chats ─── dingtalk_chats ─── feishu_chats        │
└─────────────────────────────────────────────────────────┘
```

读取流程：MongoDB user → channelBindings → PostgreSQL 查询渠道数据
写入流程：平台产生的数据（用户管理、组织变更、权限记录）→ MongoDB

## 后续扩展点（不在本次范围内）

- 登录认证方式（手机号/邮箱/SSO）
- 组织架构变更审计日志
- 用户与渠道数据的自动同步机制
- 管辖范围缓存（Redis）以加速频繁查询
