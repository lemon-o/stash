# 内置插件任务（Embedded Plugins）

内置插件任务直接在 Stash 主进程内部的脚本引擎中运行，无需拉起外部进程，执行高效轻量。

## 支持的脚本语言

Stash 目前通过 [goja](https://github.com/dop251/goja) 引擎原生支持纯 JavaScript 编写的内置插件任务。

## JavaScript 插件输入与输出

- **任务入参**：引擎通过全局变量 `input` 自动将任务上下文、配置参数与触发事件数据注入给脚本。
- **返回结果**：脚本执行的最终求值对象即为插件任务的返回数据，例如：
```javascript
(function() {
    return {
        Output: "ok"
    };
})();
```

## 内置 API

内置引擎提供了全局 `stash` 工具对象，可直接调用 GraphQL 查询、输出规范化日志（`stash.log.info(...)`）以及读写元数据。
