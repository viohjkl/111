# API 接口文档

## 接口总览

视频字幕添加应用的后端 API 接口，支持文件上传、状态查询和结果下载。

---

### 1. 上传视频文件

**接口**: `POST /api/upload`

**请求格式**:

```
Content-Type: multipart/form-data
Body: FormData { video: File }
```

**响应格式**:

```json
{
  "success": true,
  "taskId": "task_1",
  "message": "文件上传成功，开始处理"
}
```

**错误响应**:

```json
{
  "success": false,
  "message": "上传失败: 错误信息"
}
```

---

### 2. 查询处理状态

**接口**: `GET /api/status?id={taskId}`

**请求参数**:

- `id`: 任务 ID

**响应格式**:

```json
{
  "status": "processing", // waiting | processing | completed | failed
  "createdAt": "2024-01-01T12:00:00.000Z",
  "completedAt": "2024-01-01T12:00:05.000Z", // 仅在完成时存在
  "message": "处理失败原因" // 仅在失败时存在
}
```

**说明**:

- `status` 字段包含四种状态：`waiting`(等待处理)、`processing`(处理中)、`completed`(已完成)、`failed`(失败)
- `message` 字段在 `status` 为 `failed` 时返回，说明失败原因

**错误响应**:

```json
{
  "error": "Task not found"
}
```

---

### 3. 下载处理结果

**接口**: `GET /api/result?id={taskId}`

**请求参数**:

- `id`: 任务 ID

**响应格式**:

**成功时**:

```
Content-Type: video/mp4
Content-Disposition: attachment; filename="processed_task_1.mp4"
Body: MP4视频文件二进制数据
```

**错误响应**:

```json
{
  "error": "Processing not completed" // 处理未完成
}
```

或

```json
{
  "error": "Task not found" // 任务不存在
}
```

---

## 前端轮询机制说明

**轮询配置**:

- 轮询间隔: 500ms (0.5 秒)
- 最大重试次数: 120 次 (约 1 分钟)
- 网络异常处理: 连续失败 3 次后显示重试提示

**轮询流程**:

1. 上传成功后立即开始轮询
2. 每 0.5 秒请求一次 `/api/status?id={taskId}`
3. 根据 `status` 字段判断状态：
   - `waiting` 或 `processing`: 继续轮询
   - `completed`: 停止轮询，请求 `/api/result`
   - `failed`: 停止轮询，显示错误信息
4. 网络请求失败时进行重试，超过最大次数则停止

---

## 错误码说明

- `400`: 缺少必要参数或参数格式错误
- `404`: 任务不存在或处理结果未找到
- `500`: 服务器内部错误

**前端错误处理**:

- 文件验证失败: 显示错误提示，不发起请求
- 上传失败: 显示错误提示，允许重新上传
- 状态查询失败: 自动重试，超过限制后提示用户
- 结果获取失败: 显示错误提示，允许重新上传
