# 企业微信扫码登录 + 渠道身份绑定设计

> 日期：2026-05-08
> 状态：待审批

## 1. 背景与问题

### 现状

- 用户名/密码登录，与企微无关联
- 一个用户在三个系统里有三种 ID，互不关联：

```
MongoDB User._id          → ObjectId("69fc55a3...")
PG wecom_users.user_id    → "GuoTongJia"
PG wecom_kefu_messages.external_userid → "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w"
```

- 前端有"渠道选择"下拉框，但实际业务是一家公司固定一个渠道

### 目标

1. 登录方式改为企微扫码，消除手动注册和密码管理
2. 扫码登录后自动关联该用户的客服聊天记录
3. 渠道变成公司属性，去掉全局渠道选择器

## 2. 架构变更

### 2.1 公司固定渠道

```javascript
// MongoDB companies 文档新增 channel 字段
{
  _id: ObjectId("..."),
  name: "泰山兄弟",
  code: "tsxd",
  channel: "wecom",        // 新增：固定渠道
  channelConfig: {           // 新增：渠道配置
    corpId: "ww1234567890",
    agentId: "1000002",
    kfAccountId: "wkpQbHEAAA...",  // 客服账号 ID
  }
}
```

| 公司 | channel | 说明 |
|------|---------|------|
| 泰山兄弟 | wecom | 企业微信 |
| 九峰 | feishu | 飞书（未来） |
| 福多多 | dingtalk | 钉钉（未来） |

### 2.2 前端变化

**移除**：顶部导航栏的"渠道选择"下拉框
**新增**：公司名旁显示固定渠道标签（如蓝色的"企业微信"徽章）

### 2.3 用户数据源变更

用户明细页的数据源从 PG `wecom_users` 改为 **MongoDB `users`**。
MongoDB users 通过 channelBindings 存储渠道身份，不再依赖 PG 的 wecom_users 表。

## 3. 扫码登录流程

### 3.1 整体流程

```
用户访问 /login
    │
    ▼
前端展示企微扫码二维码（构造 OAuth2 授权链接）
    │
    ▼
用户用企微扫码 → 企微回调 redirect_uri?code=CODE&state=STATE
    │
    ▼
后端用 code 调用企微 API：
  1. gettoken → 获取 access_token
  2. getuserinfo → 返回 { userid: "GuoTongJia" }
    │
    ▼
用 userid 查 MongoDB users.channelBindings
  platform: "wecom", platformUserId: "GuoTongJia"
    │
    ├─ 找到 → 登录成功，创建 Session
    │
    └─ 没找到 → 自动创建 user + channelBinding → 登录成功
```

### 3.2 企微 API 调用细节

**Step 1: 获取 access_token**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken
  ?corpid={corpId}
  &corpsecret={corpSecret}
```

返回：`{ access_token: "xxx", expires_in: 7200 }`

**Step 2: 获取用户身份**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo
  ?access_token={token}
  &code={CODE}
```

返回：
```json
{
  "userid": "GuoTongJia",
  "user_ticket": "xxx"
}
```

> 注意：这是内部员工扫码，返回的是 `userid`（企业通讯录 ID），不是 `external_userid`。

**Step 3（可选）: 获取用户详情**

```
GET https://qyapi.weixin.qq.com/cgi-bin/user/get
  ?access_token={token}
  &userid={userid}
```

返回：name, mobile, avatar, department 等，用于自动填充 MongoDB user 信息。

### 3.3 后端新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/wechat/qrurl` | 返回企微扫码授权链接 |
| GET | `/api/auth/wechat/callback` | 企微扫码回调，完成登录 |

### 3.4 登录成功后

登录成功后，Session 中存储：
```json
{
  "id": "MongoDB ObjectId",
  "userid": "GuoTongJia",
  "name": "郭彤佳",
  "companyId": "ObjectId",
  "companyName": "泰山兄弟",
  "channel": "wecom"
}
```

## 4. 身份绑定：userid ↔ external_userid

### 4.1 问题

扫码登录拿到 `userid`（如 "GuoTongJia"），但客服聊天记录的标识是 `external_userid`（如 "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w"）。两个 ID 不同，需要绑定。

### 4.2 绑定时机与方式

#### 方式 A：消息 Webhook 自动绑定（推荐，最可靠）

当员工给客服机器人发消息时，企微推送消息事件到 webhook：

```json
{
  "external_userid": "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w",
  "open_kfid": "wkpQbHEAAA...",
  "content": "..."
}
```

此时 webhook 处理逻辑：

```
webhook 收到消息，拿到 external_userid
    │
    ▼
查询 wecom_kefu_customers 获取 nickname（如 "郭彤佳"）
    │
    ▼
在同公司的 MongoDB users 中搜索：
  - 优先：channelBindings 中有匹配 wecom userid 的用户
  - 且 name 匹配
    │
    ├─ 唯一匹配 → 自动追加 wecom_kefu binding
    │
    ├─ 多个同名 → 记录到 pending_bindings，等管理员确认
    │
    └─ 未匹配 → 仅记录，不绑定
```

绑定结果写入 channelBindings：
```json
{
  "channelBindings": [
    { "platform": "wecom", "platformUserId": "GuoTongJia" },
    { "platform": "wecom_kefu", "platformUserId": "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w" }
  ]
}
```

#### 方式 B：登录后主动查询绑定（备选）

员工扫码登录后（已知 `userid`），后端主动调企微客服 API：

```
POST https://qyapi.weixin.qq.com/cgi-bin/kf/customer/batchget
  ?access_token={token}
Body: { "external_userid_list": ["wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w"] }
```

返回中可能包含 name、avatar 等，用于交叉匹配。
但目前企微 API **不直接提供** `userid` → `external_userid` 的转换接口。

**结论：方式 A（Webhook 绑定）是唯一可靠路径。**

### 4.3 绑定数据模型

MongoDB users.channelBindings：

```json
[
  {
    "platform": "wecom",
    "platformUserId": "GuoTongJia",
    "platformUserName": "郭彤佳",
    "syncedAt": "2026-05-08T..."
  },
  {
    "platform": "wecom_kefu",
    "platformUserId": "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w",
    "platformUserName": "郭彤佳",
    "syncedAt": "2026-05-08T..."
  }
]
```

前端查聊天记录时：
1. 从 channelBindings 找到 `platform: "wecom_kefu"` 的 `platformUserId`
2. 用它调 `/api/wecom/kefu-messages?external_userid=wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w`

### 4.4 同名问题的处理

同名在同一个公司内发生概率低但非零。处理策略：

| 场景 | 处理 |
|------|------|
| 唯一匹配 | 自动绑定 |
| 0 个匹配 | 不绑定，等管理员手动关联 |
| 2+ 个同名 | 写入 `pending_bindings` 集合，后台提示管理员选择 |

`pending_bindings` 集合结构：
```json
{
  "externalUserId": "wmpQbHEAAAWVzPw7mP88iBNTVHR7wU7w",
  "nickname": "郭彤佳",
  "companyId": ObjectId("..."),
  "candidateUserIds": [ObjectId("..."), ObjectId("...")],
  "status": "pending",
  "createdAt": "2026-05-08T..."
}
```

管理员在后台看到待确认列表，选择正确的人，完成绑定。

## 5. 数据模型变更汇总

### 5.1 MongoDB companies

新增字段：`channel`, `channelConfig`

### 5.2 MongoDB users

channelBindings 从单一 binding 扩展为多 binding（wecom + wecom_kefu）。

### 5.3 MongoDB pending_bindings（新集合）

存储待确认的身份绑定记录。

### 5.4 PostgreSQL

- `wecom_users` 表：**降级为缓存**，不再作为用户数据源
- `wecom_kefu_customers` 表：继续使用，存储客户基础信息
- `wecom_kefu_messages` 表：继续使用，存储聊天记录

## 6. 前端变更

### 6.1 登录页

- 移除用户名/密码表单
- 展示企微扫码二维码
- 用户扫码后自动跳转 /dashboard

### 6.2 Dashboard 顶栏

- 移除"渠道选择"下拉框
- 公司名旁显示固定渠道标签（Badge）

### 6.3 用户明细页

- 数据源从 PG wecom_users 切换为 MongoDB users
- 点击"聊天记录"时，从 channelBindings 取 `wecom_kefu` 的 platformUserId 查询

## 7. 实施阶段

### Phase 1：手动绑定 + 功能跑通（当前）

- 手动把现有 6 个用户的 external_userid 写入 channelBindings
- 用户明细页切换为 MongoDB users 数据源
- 聊天记录功能可用
- 移除渠道选择器，改为固定渠道标签

### Phase 2：企微扫码登录

- 实现扫码登录 API（qrurl + callback）
- 登录自动创建/匹配 MongoDB user
- 移除用户名/密码登录

### Phase 3：Webhook 自动绑定

- 部署企微客服消息 webhook 接收器
- 新消息进来时自动绑定 external_userid
- 处理同名冲突（pending_bindings + 管理员确认）

### Phase 4：多渠道扩展

- 飞书/钉钉登录接入
- 各渠道的 channelConfig 配置
- 统一 channelBindings 抽象
