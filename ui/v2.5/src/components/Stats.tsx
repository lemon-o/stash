import React from "react";
import { useStats } from "src/core/StashService";
import { FormattedMessage, useIntl } from "react-intl";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import TextUtils from "src/utils/text";
import { useConfigurationContext } from "src/hooks/Config";
import { useHistory } from "react-router-dom";
import { ColorfulPieChart, PieSegment } from "./ColorfulPieChart";
import { Icon } from "./Shared/Icon";
import {
  faBuilding,
  faChartPie,
  faClock,
  faFilm,
  faFolder,
  faHardDrive,
  faHeart,
  faImage,
  faImages,
  faPlay,
  faPlayCircle,
  faTags,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import "./Stats.scss";

function formatBytes(bytes: number = 0): string {
  const { size, unit } = TextUtils.fileSize(bytes);
  const digits = TextUtils.fileSizeFractionalDigits(unit);
  return `${size.toFixed(digits)} ${TextUtils.formatFileSizeUnit(unit)}`;
}

export const Stats: React.FC = () => {
  const intl = useIntl();
  const history = useHistory();
  const { configuration } = useConfigurationContext();
  const { sfwContentMode } = configuration.interface;

  const oCountID = sfwContentMode
    ? "stats.total_o_count_sfw"
    : "stats.total_o_count";

  const { data, error, loading } = useStats();

  if (error) return <span>{error.message}</span>;
  if (loading || !data) return <LoadingIndicator />;

  const { stats } = data;

  const scenesDuration = TextUtils.secondsAsTimeString(
    stats.scenes_duration,
    3
  );

  const totalPlayDuration = TextUtils.secondsAsTimeString(
    stats.total_play_duration,
    3
  );

  // 1. Storage Distribution Segments
  const storageSegments: PieSegment[] = [
    {
      id: "scenes_size",
      label: intl.formatMessage({
        id: "stats.scenes_size",
        defaultMessage: "短片大小",
      }),
      value: stats.scenes_size,
      formattedValue: formatBytes(stats.scenes_size),
      color: "#6366f1",
      gradientEnd: "#818cf8",
      link: "/scenes",
      icon: faFilm,
    },
    {
      id: "images_size",
      label: intl.formatMessage({
        id: "stats.image_size",
        defaultMessage: "图片大小",
      }),
      value: stats.images_size,
      formattedValue: formatBytes(stats.images_size),
      color: "#10b981",
      gradientEnd: "#34d399",
      link: "/images",
      icon: faImage,
    },
  ];

  const totalStorageBytes = stats.scenes_size + stats.images_size;

  // 2. Media Items Distribution Segments
  const mediaSegments: PieSegment[] = [
    {
      id: "scenes",
      label: intl.formatMessage({ id: "scenes", defaultMessage: "短片" }),
      value: stats.scene_count,
      formattedValue: `${stats.scene_count.toLocaleString()} 部`,
      color: "#8b5cf6",
      gradientEnd: "#a78bfa",
      link: "/scenes",
      icon: faFilm,
    },
    {
      id: "images",
      label: intl.formatMessage({ id: "images", defaultMessage: "图片" }),
      value: stats.image_count,
      formattedValue: `${stats.image_count.toLocaleString()} 张`,
      color: "#06b6d4",
      gradientEnd: "#22d3ee",
      link: "/images",
      icon: faImage,
    },
    {
      id: "galleries",
      label: intl.formatMessage({ id: "galleries", defaultMessage: "图库" }),
      value: stats.gallery_count,
      formattedValue: `${stats.gallery_count.toLocaleString()} 册`,
      color: "#f59e0b",
      gradientEnd: "#fbbf24",
      link: "/galleries",
      icon: faImages,
    },
    {
      id: "groups",
      label: intl.formatMessage({ id: "groups", defaultMessage: "集合" }),
      value: stats.group_count,
      formattedValue: `${stats.group_count.toLocaleString()} 个`,
      color: "#ec4899",
      gradientEnd: "#f472b6",
      link: "/groups",
      icon: faFolder,
    },
  ];

  const totalMediaCount =
    stats.scene_count +
    stats.image_count +
    stats.gallery_count +
    stats.group_count;

  // 3. Metadata & Taxonomy Distribution Segments
  const metadataSegments: PieSegment[] = [
    {
      id: "performers",
      label: intl.formatMessage({
        id: "performers",
        defaultMessage: "演员",
      }),
      value: stats.performer_count,
      formattedValue: `${stats.performer_count.toLocaleString()} 位`,
      color: "#f43f5e",
      gradientEnd: "#fb7185",
      link: "/performers",
      icon: faUsers,
    },
    {
      id: "studios",
      label: intl.formatMessage({ id: "studios", defaultMessage: "工作室" }),
      value: stats.studio_count,
      formattedValue: `${stats.studio_count.toLocaleString()} 个`,
      color: "#a855f7",
      gradientEnd: "#c084fc",
      link: "/studios",
      icon: faBuilding,
    },
    {
      id: "tags",
      label: intl.formatMessage({ id: "tags", defaultMessage: "标签" }),
      value: stats.tag_count,
      formattedValue: `${stats.tag_count.toLocaleString()} 个`,
      color: "#0ea5e9",
      gradientEnd: "#38bdf8",
      link: "/tags",
      icon: faTags,
    },
    {
      id: "groups",
      label: intl.formatMessage({ id: "groups", defaultMessage: "集合" }),
      value: stats.group_count,
      formattedValue: `${stats.group_count.toLocaleString()} 个`,
      color: "#f59e0b",
      gradientEnd: "#fbbf24",
      link: "/groups",
      icon: faFolder,
    },
  ];

  const totalMetadataCount =
    stats.performer_count +
    stats.studio_count +
    stats.tag_count +
    stats.group_count;

  // 4. Playback Coverage Segments
  const unplayedScenes = Math.max(0, stats.scene_count - stats.scenes_played);
  const playbackSegments: PieSegment[] = [
    {
      id: "played",
      label: intl.formatMessage({
        id: "stats.scenes_played",
        defaultMessage: "已播放短片",
      }),
      value: stats.scenes_played,
      formattedValue: `${stats.scenes_played.toLocaleString()} 部`,
      color: "#10b981",
      gradientEnd: "#34d399",
      link: "/scenes",
      icon: faPlay,
    },
    {
      id: "unplayed",
      label: intl.formatMessage({
        id: "stats.unplayed_scenes",
        defaultMessage: "未播放短片",
      }),
      value: unplayedScenes,
      formattedValue: `${unplayedScenes.toLocaleString()} 部`,
      color: "#334155",
      gradientEnd: "#475569",
      link: "/scenes",
      icon: faClock,
    },
  ];

  const watchPercentage =
    stats.scene_count > 0
      ? ((stats.scenes_played / stats.scene_count) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="stats-dashboard-container">
      {/* Dashboard Top Header */}
      <div className="stats-dashboard-header">
        <div className="stats-dashboard-title-wrap">
          <h2 className="stats-dashboard-title">
            <span className="stats-header-icon">
              <Icon icon={faChartPie} />
            </span>
            <FormattedMessage id="statistics" defaultMessage="统计看板" />
          </h2>
          <p className="stats-dashboard-subtitle">
            <FormattedMessage
              id="stats.dashboard_subtitle"
              defaultMessage="媒体库存储分布、资源类型与播放进度的彩色图表总览"
            />
          </p>
        </div>
      </div>

      {/* Top Summary KPI Cards */}
      <div className="stats-kpi-grid">
        <div
          className="stats-kpi-card"
          style={
            {
              "--kpi-accent": "#8b5cf6",
              "--kpi-bg": "rgba(139, 92, 246, 0.12)",
            } as React.CSSProperties
          }
          onClick={() => history.push("/scenes")}
        >
          <div className="stats-kpi-top">
            <span className="stats-kpi-label">
              <FormattedMessage id="scenes" defaultMessage="短片" />
            </span>
            <span className="stats-kpi-icon">
              <Icon icon={faFilm} />
            </span>
          </div>
          <h3 className="stats-kpi-value">
            {stats.scene_count.toLocaleString()}
          </h3>
          <p className="stats-kpi-sub">
            {scenesDuration || "0s"} · {formatBytes(stats.scenes_size)}
          </p>
        </div>

        <div
          className="stats-kpi-card"
          style={
            {
              "--kpi-accent": "#06b6d4",
              "--kpi-bg": "rgba(6, 182, 212, 0.12)",
            } as React.CSSProperties
          }
          onClick={() => history.push("/images")}
        >
          <div className="stats-kpi-top">
            <span className="stats-kpi-label">
              <FormattedMessage
                id="stats.images_and_galleries"
                defaultMessage="图片与图库"
              />
            </span>
            <span className="stats-kpi-icon">
              <Icon icon={faImages} />
            </span>
          </div>
          <h3 className="stats-kpi-value">
            {stats.image_count.toLocaleString()}
          </h3>
          <p className="stats-kpi-sub">
            {stats.gallery_count} 个图库 · {formatBytes(stats.images_size)}
          </p>
        </div>

        <div
          className="stats-kpi-card"
          style={
            {
              "--kpi-accent": "#f43f5e",
              "--kpi-bg": "rgba(244, 63, 94, 0.12)",
            } as React.CSSProperties
          }
          onClick={() => history.push("/performers")}
        >
          <div className="stats-kpi-top">
            <span className="stats-kpi-label">
              <FormattedMessage
                id="stats.metadata_entities"
                defaultMessage="组织元数据"
              />
            </span>
            <span className="stats-kpi-icon">
              <Icon icon={faTags} />
            </span>
          </div>
          <h3 className="stats-kpi-value">
            {totalMetadataCount.toLocaleString()}
          </h3>
          <p className="stats-kpi-sub">
            {stats.performer_count} 演员 · {stats.studio_count} 工作室 ·{" "}
            {stats.tag_count} 标签
          </p>
        </div>

        <div
          className="stats-kpi-card"
          style={
            {
              "--kpi-accent": "#10b981",
              "--kpi-bg": "rgba(16, 185, 129, 0.12)",
            } as React.CSSProperties
          }
          onClick={() => history.push("/scenes")}
        >
          <div className="stats-kpi-top">
            <span className="stats-kpi-label">
              <FormattedMessage
                id="stats.watch_progress"
                defaultMessage="观看进度"
              />
            </span>
            <span className="stats-kpi-icon">
              <Icon icon={faPlayCircle} />
            </span>
          </div>
          <h3 className="stats-kpi-value">{watchPercentage}%</h3>
          <p className="stats-kpi-sub">
            {stats.scenes_played} / {stats.scene_count} 部 ·{" "}
            {stats.total_play_count} 次播放
          </p>
        </div>

        <div
          className="stats-kpi-card"
          style={
            {
              "--kpi-accent": "#ec4899",
              "--kpi-bg": "rgba(236, 72, 153, 0.12)",
            } as React.CSSProperties
          }
        >
          <div className="stats-kpi-top">
            <span className="stats-kpi-label">
              <FormattedMessage id={oCountID} />
            </span>
            <span className="stats-kpi-icon">
              <Icon icon={faHeart} />
            </span>
          </div>
          <h3 className="stats-kpi-value">
            {stats.total_o_count.toLocaleString()}
          </h3>
          <p className="stats-kpi-sub">
            累计观影时长: {totalPlayDuration || "0s"}
          </p>
        </div>
      </div>

      {/* Colorful Pie Charts Grid (4 Core Charts) */}
      <div className="stats-charts-grid">
        {/* Chart 1: Storage Distribution */}
        <ColorfulPieChart
          title={intl.formatMessage({
            id: "stats.chart_storage_title",
            defaultMessage: "存储容量占用分布",
          })}
          subtitle={intl.formatMessage({
            id: "stats.chart_storage_sub",
            defaultMessage: "视频短片与静态图片占用的磁盘存储空间比例",
          })}
          icon={faHardDrive}
          segments={storageSegments}
          totalLabel={intl.formatMessage({
            id: "stats.total_storage",
            defaultMessage: "总存储",
          })}
          formattedTotal={formatBytes(totalStorageBytes)}
          centerSubtext={intl.formatMessage({
            id: "stats.storage_subtext",
            defaultMessage: "磁盘占用",
          })}
        />

        {/* Chart 2: Media Items Distribution */}
        <ColorfulPieChart
          title={intl.formatMessage({
            id: "stats.chart_media_title",
            defaultMessage: "媒体资源结构构成",
          })}
          subtitle={intl.formatMessage({
            id: "stats.chart_media_sub",
            defaultMessage: "短片、图片、图库与集合数量构成比例",
          })}
          icon={faFilm}
          segments={mediaSegments}
          totalLabel={intl.formatMessage({
            id: "stats.total_media",
            defaultMessage: "媒体总数",
          })}
          formattedTotal={totalMediaCount.toLocaleString()}
          centerSubtext={intl.formatMessage({
            id: "stats.media_subtext",
            defaultMessage: "条目总计",
          })}
        />

        {/* Chart 3: Metadata & Taxonomy Distribution */}
        <ColorfulPieChart
          title={intl.formatMessage({
            id: "stats.chart_metadata_title",
            defaultMessage: "组织与分类元数据",
          })}
          subtitle={intl.formatMessage({
            id: "stats.chart_metadata_sub",
            defaultMessage: "演员、工作室、标签与集合的实体分布",
          })}
          icon={faTags}
          segments={metadataSegments}
          totalLabel={intl.formatMessage({
            id: "stats.total_metadata",
            defaultMessage: "元数据项",
          })}
          formattedTotal={totalMetadataCount.toLocaleString()}
          centerSubtext={intl.formatMessage({
            id: "stats.metadata_subtext",
            defaultMessage: "分类实体",
          })}
        />

        {/* Chart 4: Playback Coverage */}
        <ColorfulPieChart
          title={intl.formatMessage({
            id: "stats.chart_playback_title",
            defaultMessage: "短片播放与观看进度",
          })}
          subtitle={intl.formatMessage({
            id: "stats.chart_playback_sub",
            defaultMessage: "媒体库中短片的已观看与未观看完成度",
          })}
          icon={faPlayCircle}
          segments={playbackSegments}
          totalLabel={intl.formatMessage({
            id: "stats.watch_rate",
            defaultMessage: "完成率",
          })}
          formattedTotal={`${watchPercentage}%`}
          centerSubtext={`${stats.scenes_played} / ${stats.scene_count} 部`}
        />
      </div>

      {/* Engagement & Duration Detailed Card */}
      <div className="stats-activity-card">
        <div className="stats-pie-title-wrap">
          <span className="stats-pie-icon">
            <Icon icon={faClock} />
          </span>
          <div>
            <h4 className="stats-pie-title">
              <FormattedMessage
                id="stats.activity_title"
                defaultMessage="观影活跃与时长统计"
              />
            </h4>
            <p className="stats-pie-subtitle">
              <FormattedMessage
                id="stats.activity_subtitle"
                defaultMessage="媒体库短片播放总时长、播放频次与互动点赞综合数据"
              />
            </p>
          </div>
        </div>

        <div className="stats-activity-grid">
          <div className="stats-activity-item">
            <div className="stats-activity-item-header">
              <Icon icon={faFilm} />
              <span>
                <FormattedMessage
                  id="stats.scenes_duration"
                  defaultMessage="短片总时长"
                />
              </span>
            </div>
            <div className="stats-activity-item-val">
              {scenesDuration || "0s"}
            </div>
          </div>

          <div className="stats-activity-item">
            <div className="stats-activity-item-header">
              <Icon icon={faClock} />
              <span>
                <FormattedMessage
                  id="stats.total_play_duration"
                  defaultMessage="总播放时长"
                />
              </span>
            </div>
            <div className="stats-activity-item-val">
              {totalPlayDuration || "0s"}
            </div>
          </div>

          <div className="stats-activity-item">
            <div className="stats-activity-item-header">
              <Icon icon={faPlay} />
              <span>
                <FormattedMessage
                  id="stats.total_play_count"
                  defaultMessage="总播放次数"
                />
              </span>
            </div>
            <div className="stats-activity-item-val">
              {stats.total_play_count.toLocaleString()} 次
            </div>
          </div>

          <div className="stats-activity-item">
            <div className="stats-activity-item-header">
              <Icon icon={faHeart} />
              <span>
                <FormattedMessage id={oCountID} />
              </span>
            </div>
            <div className="stats-activity-item-val">
              {stats.total_o_count.toLocaleString()} 次
            </div>
          </div>
        </div>

        {stats.scene_count > 0 && (
          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="text-muted small">
                <FormattedMessage
                  id="stats.viewing_progress"
                  defaultMessage="短片观看覆盖进度"
                />
                : {stats.scenes_played} / {stats.scene_count} 部短片
              </span>
              <span className="font-weight-bold small text-success">
                {watchPercentage}%
              </span>
            </div>
            <div className="stats-activity-progress-bar-wrap">
              <div
                className="stats-activity-progress-bar"
                style={{ width: `${watchPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stats;
