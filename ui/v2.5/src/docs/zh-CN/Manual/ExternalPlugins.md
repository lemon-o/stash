# 外部插件任务（External Plugins）

外部插件任务通过在操作系统中拉起外部二进制进程或脚本来执行。

## 插件接口协议

Stash 与外部插件进程之间支持两种通信接口：RPC 和 Raw。

### RPC 接口

RPC 接口采用标准 JSON-RPC 协议与插件子进程进行双向异步通信。当需要终止任务时，Stash 会向插件发送停止请求，由插件自行安全优雅退出。

### Raw 接口

Raw 接口是极简模式。Stash 服务端通过标准输入流（stdin）将 JSON 编码的任务参数传入子进程，并从标准输出流（stdout）读取执行结果。当终止任务时，Stash 会直接终止该子进程。

## 日志输出

外部插件可通过标准错误流（stderr）将日志传输至 Stash 服务端统一记录。可以通过控制前缀指定日志等级（如 INFO、WARNING、DEBUG 或进度百分比）。

## 配置文件规范（exec / interface）

在插件配置 YAML 中通过 `exec` 指定可执行文件及启动参数，例如：
```yaml
exec:
  - python
  - "{pluginDir}/script.py"
interface: raw
```
可以使用 `{pluginDir}` 占位符指向插件自身所在目录。
