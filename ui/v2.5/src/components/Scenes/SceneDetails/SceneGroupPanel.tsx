import React from "react";
import { Link } from "react-router-dom";
import { useIntl, FormattedMessage } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { Icon } from "src/components/Shared/Icon";
import { RatingBanner } from "src/components/Shared/RatingBanner";
import TextUtils from "src/utils/text";
import {
  faFilm,
  faPlayCircle,
  faCalendarAlt,
  faVideo,
  faArrowRight,
  faFolderOpen,
} from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";

interface ISceneGroupPanelProps {
  scene: GQL.SceneDataFragment;
}

export const SceneGroupPanel: React.FC<ISceneGroupPanelProps> = ({ scene }) => {
  const intl = useIntl();

  if (!scene.groups || scene.groups.length === 0) {
    return (
      <div className="scene-group-panel text-center text-muted p-4">
        <FormattedMessage id="no_groups" defaultMessage="暂无所属集合" />
      </div>
    );
  }

  return (
    <div className="scene-group-panel">
      {scene.groups.map((sceneGroup) => {
        const { group, scene_index } = sceneGroup;
        const cover = group.front_image_path || group.back_image_path;
        const totalScenes = group.scene_count || group.scenes?.length || 0;

        return (
          <div key={group.id} className="scene-group-showcase card">
            <div className="scene-group-card-inner">
              {/* Cover Column */}
              <div className="scene-group-cover-wrapper">
                <Link to={`/groups/${group.id}`} className="scene-group-cover-link">
                  {cover ? (
                    <img
                      src={cover}
                      alt={group.name}
                      className="scene-group-cover-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="scene-group-cover-placeholder">
                      <Icon icon={faFolderOpen} className="placeholder-icon" />
                      <span>{group.name}</span>
                    </div>
                  )}
                  {group.rating100 && <RatingBanner rating={group.rating100} />}
                </Link>
              </div>

              {/* Information Column */}
              <div className="scene-group-info">
                <div className="scene-group-header-row">
                  <h3 className="scene-group-title">
                    <Link to={`/groups/${group.id}`}>{group.name}</Link>
                  </h3>
                </div>

                {/* Metadata Badges */}
                <div className="scene-group-badges">
                  {scene_index !== undefined && scene_index !== null && (
                    <span className="scene-group-badge episode-badge">
                      <Icon icon={faFilm} className="mr-1" />
                      <FormattedMessage
                        id="scene_number_index"
                        defaultMessage="第 {index} 集"
                        values={{ index: scene_index }}
                      />
                    </span>
                  )}
                  {group.studio && (
                    <Link
                      to={`/studios/${group.studio.id}`}
                      className="scene-group-badge studio-badge"
                    >
                      <Icon icon={faVideo} className="mr-1" />
                      {group.studio.name}
                    </Link>
                  )}
                  {group.date && (
                    <span className="scene-group-badge date-badge">
                      <Icon icon={faCalendarAlt} className="mr-1" />
                      {TextUtils.formatFuzzyDate(intl, group.date)}
                    </span>
                  )}
                  {totalScenes > 0 && (
                    <span className="scene-group-badge count-badge">
                      <Icon icon={faPlayCircle} className="mr-1" />
                      {totalScenes} <FormattedMessage id="scenes" defaultMessage="短片" />
                    </span>
                  )}
                </div>

                {/* Synopsis */}
                {group.synopsis && (
                  <p className="scene-group-synopsis">{group.synopsis}</p>
                )}

                {/* Action Link */}
                <div className="scene-group-action-row">
                  <Link
                    to={`/groups/${group.id}`}
                    className="btn btn-outline-primary btn-sm scene-group-btn"
                  >
                    <span>
                      <FormattedMessage
                        id="actions.view_group"
                        defaultMessage="查看集合全部内容"
                      />
                    </span>
                    <Icon icon={faArrowRight} className="ml-1" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Collection Episodes List */}
            {group.scenes && group.scenes.length > 0 && (
              <div className="scene-group-episodes-section">
                <div className="scene-group-episodes-header">
                  <span className="episodes-header-title">
                    <FormattedMessage
                      id="collection_scenes_list"
                      defaultMessage="集合包含短片 ({count})"
                      values={{ count: group.scenes.length }}
                    />
                  </span>
                </div>
                <div className="scene-group-episodes-list">
                  {group.scenes.map((s, idx) => {
                    const isCurrent = s.id === scene.id;
                    const itemTitle =
                      s.title || `${intl.formatMessage({ id: "scene" })} #${idx + 1}`;

                    if (isCurrent) {
                      return (
                        <div
                          key={s.id}
                          className={cx("scene-group-episode-item", "current")}
                        >
                          <span className="episode-index">#{idx + 1}</span>
                          <span className="episode-name">{itemTitle}</span>
                          <span className="episode-now-playing">
                            <FormattedMessage id="now_playing" defaultMessage="当前播放" />
                          </span>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={s.id}
                        to={`/scenes/${s.id}`}
                        className="scene-group-episode-item"
                      >
                        <span className="episode-index">#{idx + 1}</span>
                        <span className="episode-name">{itemTitle}</span>
                        <Icon icon={faPlayCircle} className="episode-play-icon" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SceneGroupPanel;
