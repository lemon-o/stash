# UI 插件接口 API（UI Plugin API）

浏览器全局 `window` 对象上暴露了 `PluginApi` 对象，允许插件向前端注入定制路由、拓展组件、监听事件与调用内部服务。

## 核心命名空间与属性

- `PluginApi.React` 与 `PluginApi.ReactDOM`：前端 React 运行时实例
- `PluginApi.GQL`：自动生成的 GraphQL 查询与变更接口
- `PluginApi.libraries`：内置的常用依赖库（包括 `Bootstrap`、`ReactRouterDOM`、`Apollo`、`FontAwesome` 图标库、`Mousetrap` 快捷键库等）

## 注册与扩展方法（register）

### 注册自定义页面路由

```javascript
PluginApi.register.route(path, component)
```
允许插件注册形如 `/plugin/your-plugin` 的专属前端页面路由，并渲染指定的 React 组件。

### 注册插槽组件与扩展点

通过 `PluginApi.register.component` 和各个扩展钩子，插件可以在短片详情、演员页面、顶部导航栏等关键 UI 区域插入自定义操作按钮、标签或卡片。

## 事件与钩子系统

UI 插件可通过 `PluginApi.Event.addEventListener` 监听前端全局生命周期事件，如页面切换、短片播放、表单保存等，实现灵活的交互自动化。
