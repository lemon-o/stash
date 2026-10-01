# 导入/导出 JSON 规范说明

Stash 数据库中的所有实体元数据均支持导出为结构化 JSON 文件。该结构可以手动修改、程序化处理或通过外部脚本批量构建，随后再导入 Stash 中，方便迁移和批量管理。

导出的元数据目录结构包含以下子文件夹：
* `files`：文件实体
* `galleries`：图库实体
* `images`：图片实体
* `performers`：演员实体
* `scenes`：短片实体
* `studios`：工作室实体
* `groups`：集合实体

## 实体字段定义

- **演员（Performer）**：`name`（姓名）、`url`、`birthdate`（出生日期）、`ethnicity`（种族）、`country`（国籍）、`hair_color`（发色）、`eye_color`（瞳色）、`height`（身高）、`measurements`（三围）、`aliases`（别名列表）等。
- **工作室（Studio）**：`name`（名称）、`url`、`parent_studio`（母工作室关联）等。
- **短片（Scene）**：`title`（标题）、`details`（详情简介）、`url`、`date`（日期）、`rating`（评分）、`studio`、`performers`、`tags`、`markers`（时间轴标记列表）等。
- **集合（Group）**：`name`、`aliases`、`duration`、`date`、`rating`、`studio`、`director` 等。

导入时系统会自动按子目录递归读取解析并合入数据库。
