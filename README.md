# Hagen–Poiseuille 层流计算服务

圆截面直管、定常、层流、牛顿流体、不可压假设下的 Hagen–Poiseuille 解析解 HTTP 服务。
供微流控芯片选型与驱动泵标定时直接调用，不再手算。

**明确不支持**（不在本服务范围内）：管网环路平差、Colebrook 等湍流摩阻迭代、
宾汉流体等屈服应力非牛顿流、回流建模。一旦雷诺数达到层流上限，服务直接拒绝，
不会硬套层流公式。

## 物理模型

所有量均为 SI 单位：R [m]、L [m]、Δp [Pa]、μ [Pa·s]、ρ [kg/m³]、Q [m³/s]、τ_w [Pa]。

- 正算：`Q = π R⁴ Δp / (8 μ L)`（**半径四次方**）
- 平均速度：`v̄ = Q / (π R²) = R² Δp / (8 μ L)`
- 轴心速度：`v_max = 2 v̄`
- 壁面剪应力：`τ_w = R Δp / (2L)`（只与 R、Δp、L 有关，**与粘度无关**）
- 雷诺数：`Re = v̄ · (2R) · ρ / μ`
- 反算：`Δp = 8 μ L Q / (π R⁴)`，反解结果回代正算严格还原目标 Q
- 层流判据：`Re < 2300`；`Re ≥ 2300` 返回 `not_laminar`（Δp = 0 的零流量工况合法）

## 技术栈与模块划分

Node.js 20 + NestJS（TypeScript）。各职责拆成独立模块：

| 模块 | 职责 |
| --- | --- |
| `src/kernel/poiseuille.service.ts` | 层流正算解析内核（单点与扫描共用，全局唯一实现） |
| `src/kernel/inverse.service.ts` | 压差反解 |
| `src/kernel/reynolds.service.ts` | 雷诺数计算与层流判据 |
| `src/kernel/shear.service.ts` | 壁面剪应力计算 |
| `src/kernel/flow.exception.ts` | 结构化错误与开算前校验 |
| `src/specs/` | 具名规格内存登记、查询、启动预置算例 |
| `src/flow/` | HTTP 编排、规格名/内联参数解析、批量扫描 |
| `src/common/global-exception.filter.ts` | 统一结构化错误响应（无未捕获异常泄漏） |
| `src/health/` | 监控状态接口 |

规格只驻内存：重启即失，不落盘、不持久化。

## 运行

### 容器（一条命令构建并运行单进程服务）

```bash
docker build -t poiseuille-service . && docker run --rm -p 3000:3000 poiseuille-service
# 或
docker compose up --build
```

### 本地开发

```bash
npm ci
npm run start:dev     # http://localhost:3000
npm run build && npm run start:prod
```

所有路由带 URI 版本前缀 `/v1`。

## 接口

### 状态与规格

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/health` | 监控状态（服务、模型、层流阈值、启动时间、uptime） |
| POST | `/v1/specs` | 登记具名规格 `{name,radius,length,viscosity,density}` |
| GET | `/v1/specs` | 只读回显全部已登记规格 |

### 正算 / 反算（单点）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/flow/forward` | 给 Δp，返回 Q、v̄、v_max、Re、τ_w |
| POST | `/v1/flow/inverse` | 给目标 Q，反解所需 Δp（同样过雷诺数关） |

几何/流体可写 `specName` 引用已登记规格，也可内联整组
`radius,length,viscosity,density`。

正算请求：

```json
{ "radius": 0.001, "length": 1, "viscosity": 0.001, "density": 1000, "pressureDrop": 1000 }
```

正算响应：

```json
{
  "flowRate": 3.9269908169872414e-7,
  "meanVelocity": 0.125,
  "maxVelocity": 0.25,
  "reynoldsNumber": 250,
  "wallShearStress": 0.5,
  "regime": "laminar"
}
```

用规格名：

```json
{ "specName": "demo-capillary", "pressureDrop": 1000 }
```

反算请求 / 响应：

```json
// 请求
{ "radius": 0.001, "length": 1, "viscosity": 0.001, "density": 1000, "targetFlowRate": 3e-7 }
// 响应
{
  "pressureDrop": 763.9437268410978,
  "targetFlowRate": 3e-7,
  "meanVelocity": 0.09549, "maxVelocity": 0.19099,
  "reynoldsNumber": 190.9859, "wallShearStress": 0.38197,
  "regime": "laminar"
}
```

### 批量扫描

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/flow/scan/radius` | 固定 Δp/几何/流体，扫一串半径（画 Q∝R⁴ 曲线） |
| POST | `/v1/flow/scan/flow` | 固定几何/流体，扫一串目标流量（反解 Δp） |

```json
{
  "radius": 0.001, "length": 1, "viscosity": 0.001, "density": 1000,
  "pressureDrop": 800,
  "points": [ { "radius": 0.001 }, { "radius": -1 }, { "radius": 0.01 } ]
}
```

响应里每个点独立标记 `ok` / `error`；单点非法或触发湍流**只影响该点**，
其余照常返回。扫描与单点调用同一个内核方法，不存在两套实现。

```json
{
  "sweep": "radius", "count": 3, "okCount": 1, "errorCount": 2,
  "results": [
    { "index": 0, "status": "ok", "input": {"radius": 0.001}, "result": { "...": "..." } },
    { "index": 1, "status": "error", "input": {"radius": -1},
      "error": { "code": "invalid_radius", "message": "radius must be a positive number." } },
    { "index": 2, "status": "error", "input": {"radius": 0.01},
      "error": { "code": "not_laminar", "message": "..." } }
  ]
}
```

## 错误格式与错误码

任何失败都是统一结构，且在开算前拦截，不抛未捕获异常、不返回空值：

```json
{ "error": { "code": "invalid_radius", "message": "...", "details": { "received": 0 } } }
```

| code | HTTP | 触发条件 |
| --- | --- | --- |
| `invalid_payload` | 400 | 请求体结构/类型不合法（字段缺失、类型错、未知字段） |
| `invalid_radius` | 400 | 半径非正或非有限数 |
| `invalid_length` | 400 | 管长非正 |
| `invalid_viscosity` | 400 | 粘度非正 |
| `invalid_density` | 400 | 密度非正 |
| `invalid_pressure_drop` | 400 | 压差为负（不建模回流） |
| `invalid_target_flow` | 400 | 目标流量非正 |
| `missing_params` | 400 | 既无 `specName` 又未给齐内联参数 |
| `unknown_spec` | 404 | 引用未登记的规格名 |
| `spec_exists` | 409 | 规格名重复登记（不覆盖） |
| `not_laminar` | 422 | Re ≥ 2300，层流假设不成立（正算/反算均拒绝） |
| `route_not_found` | 404 | 未知路由 |
| `internal_error` | 500 | 兜底（服务端记日志，不外泄堆栈） |

## 启动预置算例

启动即登记 `demo-capillary`：R = 50 μm，L = 20 mm，μ = 1 Pa·s（高粘度），
ρ = 1260 kg/m³。即使 Δp = 1000 Pa，Re 仍约为 2e-6，远低于 2300，
一眼可确认稳落在层流区。

## 测试

```bash
npm test                 # 34 个单元测试（内核/登记/扫描编排）
npm run test:e2e         # 26 个 HTTP 端到端用例
```

另有一个对运行中服务逐条核对验收关系的脚本：

```bash
npm run build
PORT=3000 node dist/main.js     # 终端 A
node acceptance.js 3000         # 终端 B（29 项断言：16 倍/减半/零流量/
                                #   剪应力无关粘度/回代/越界/分型拒绝/扫描一致）
```

验收要点均已用自动化用例钉死：半径翻倍流量 16 倍、粘度翻倍流量减半、
零压差零流量、剪应力不随粘度变、反解回代还原目标流量、Re 越界 `not_laminar`、
各类非法参数分型拒绝、未知规格名拒绝、扫描与单点同值一致、并发互不串扰。
