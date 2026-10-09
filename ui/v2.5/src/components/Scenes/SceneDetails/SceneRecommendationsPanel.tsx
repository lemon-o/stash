import React, { useCallback, useMemo, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { objectTitle } from "src/core/files";
import TextUtils from "src/utils/text";
import { Icon } from "src/components/Shared/Icon";
import { faSyncAlt } from "@fortawesome/free-solid-svg-icons";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { PatchComponent } from "src/patch";

interface ISceneRecommendationsPanelProps {
  scene: GQL.SceneDataFragment;
  onSceneClicked?: (sceneID: string) => void;
}

type FilterCategory = "all" | "performer" | "studio" | "tag";

interface IRecommendationItem {
  scene: GQL.SlimSceneDataFragment;
  reason: "performer" | "studio" | "tag" | "general";
  reasonLabel: string;
}

function getDailySeed(date: Date = new Date(), salt: number = 0): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let h = (y * 10000 + m * 100 + d + salt * 100003) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 90000000) + 10000000;
}

const SceneRecommendationCard: React.FC<{
  item: IRecommendationItem;
  onClick: (e: React.MouseEvent, sceneId: string) => void;
}> = React.memo(({ item, onClick }) => {
  const { scene: s, reason, reasonLabel } = item;
  const intl = useIntl();
  const [isHovered, setIsHovered] = useState(false);

  const file = s.files.length > 0 ? s.files[0] : undefined;
  const title = objectTitle(s);
  const performers = s.performers.map((p) => p.name).join(", ");
  const duration = file?.duration
    ? TextUtils.secondsToTimestamp(file.duration)
    : undefined;

  const resolution = file?.height
    ? file.height >= 2160
      ? "4K"
      : file.height >= 1440
      ? "1440p"
      : file.height >= 1080
      ? "1080p"
      : file.height >= 720
      ? "720p"
      : `${file.height}p`
    : undefined;

  const previewVideo = s.paths.preview;

  return (
    <Link
      to={`/scenes/${s.id}`}
      className="scene-rec-card"
      onClick={(e) => onClick(e, s.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="scene-rec-media">
        <img
          loading="lazy"
          decoding="async"
          src={s.paths.screenshot ?? ""}
          alt={title}
          className="scene-rec-thumb"
        />
        {isHovered && previewVideo && (
          <video
            disableRemotePlayback
            playsInline
            muted
            autoPlay
            loop
            preload="none"
            src={previewVideo}
            className="scene-rec-video-preview"
          />
        )}
        {duration && <span className="scene-rec-duration">{duration}</span>}
        {resolution && (
          <span className="scene-rec-resolution">{resolution}</span>
        )}
      </div>

      <div className="scene-rec-info">
        <div className="scene-rec-title" title={title}>
          {title}
        </div>

        <div className="scene-rec-sub">
          <span className={`scene-rec-badge badge-${reason}`}>
            {reasonLabel}
          </span>
          {performers && (
            <span className="scene-rec-performers" title={performers}>
              {performers}
            </span>
          )}
        </div>

        <div className="scene-rec-meta">
          {s.studio?.name && (
            <span className="scene-rec-studio" title={s.studio.name}>
              {s.studio.name}
            </span>
          )}
          {s.date && (
            <span className="scene-rec-date">
              {TextUtils.formatFuzzyDate(intl, s.date)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

export const SceneRecommendationsPanel: React.FC<ISceneRecommendationsPanelProps> =
  PatchComponent("SceneRecommendationsPanel", ({ scene, onSceneClicked }) => {
    const intl = useIntl();
    const history = useHistory();
    const [salt, setSalt] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] =
      useState<FilterCategory>("all");

    const dailySeed = useMemo(() => {
      return getDailySeed(new Date(), salt);
    }, [salt]);

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      setSalt((s) => s + 1);
      setTimeout(() => setIsRefreshing(false), 500);
    }, []);

    // 1. Performers query
    const performerIds = useMemo(
      () => scene.performers.map((p) => p.id),
      [scene.performers]
    );
    const hasPerformers = performerIds.length > 0;

    const performerResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 24,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          performers: {
            value: performerIds,
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: !hasPerformers,
    });

    // 2. Studio query
    const studioId = scene.studio?.id;
    const hasStudio = !!studioId;

    const studioResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 20,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          studios: {
            value: studioId ? [studioId] : [],
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: !hasStudio,
    });

    // 3. Tags query
    const tagIds = useMemo(
      () => scene.tags.map((t) => t.id).slice(0, 5),
      [scene.tags]
    );
    const hasTags = tagIds.length > 0;

    const tagResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 20,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          tags: {
            value: tagIds,
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: !hasTags,
    });

    // 4. Fallback / General library recommendations
    const generalResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
      },
    });

    // Construct recommendation pools
    const performerScenes = useMemo(() => {
      const list = performerResult.data?.findScenes.scenes ?? [];
      const currentPerformerIds = new Set(performerIds);
      return list
        .filter((s) => s.id !== scene.id)
        .map((s): IRecommendationItem => {
          const matched = s.performers.find((p) =>
            currentPerformerIds.has(p.id)
          );
          const label = matched
            ? intl.formatMessage(
                {
                  id: "recommended_same_performer_named",
                  defaultMessage: "同演员: {name}",
                },
                { name: matched.name }
              )
            : intl.formatMessage({
                id: "recommended_same_performer",
                defaultMessage: "同演员",
              });
          return { scene: s, reason: "performer", reasonLabel: label };
        });
    }, [performerResult.data, scene.id, performerIds, intl]);

    const studioScenes = useMemo(() => {
      const list = studioResult.data?.findScenes.scenes ?? [];
      const label = scene.studio?.name
        ? intl.formatMessage(
            {
              id: "recommended_same_studio_named",
              defaultMessage: "同工作室: {name}",
            },
            { name: scene.studio.name }
          )
        : intl.formatMessage({
            id: "recommended_same_studio",
            defaultMessage: "同工作室",
          });
      return list
        .filter((s) => s.id !== scene.id)
        .map((s): IRecommendationItem => ({
          scene: s,
          reason: "studio",
          reasonLabel: label,
        }));
    }, [studioResult.data, scene.id, scene.studio?.name, intl]);

    const tagScenes = useMemo(() => {
      const list = tagResult.data?.findScenes.scenes ?? [];
      const label = intl.formatMessage({
        id: "recommended_same_tag",
        defaultMessage: "同标签",
      });
      return list
        .filter((s) => s.id !== scene.id)
        .map((s): IRecommendationItem => ({
          scene: s,
          reason: "tag",
          reasonLabel: label,
        }));
    }, [tagResult.data, scene.id, intl]);

    const generalScenes = useMemo(() => {
      const list = generalResult.data?.findScenes.scenes ?? [];
      const label = intl.formatMessage({
        id: "recommended_for_you",
        defaultMessage: "为你推荐",
      });
      return list
        .filter((s) => s.id !== scene.id)
        .map((s): IRecommendationItem => ({
          scene: s,
          reason: "general",
          reasonLabel: label,
        }));
    }, [generalResult.data, scene.id, intl]);

    // Aggregate items based on selected category with deduplication
    const displayedItems = useMemo(() => {
      if (selectedCategory === "performer") {
        return performerScenes;
      }
      if (selectedCategory === "studio") {
        return studioScenes;
      }
      if (selectedCategory === "tag") {
        return tagScenes;
      }

      // "all" - Merge: performer -> studio -> tag -> general, deduplicated, capped at 30
      const seen = new Set<string>();
      const result: IRecommendationItem[] = [];

      const addList = (items: IRecommendationItem[]) => {
        for (const item of items) {
          if (!seen.has(item.scene.id)) {
            seen.add(item.scene.id);
            result.push(item);
          }
        }
      };

      addList(performerScenes);
      addList(studioScenes);
      addList(tagScenes);
      addList(generalScenes);

      return result.slice(0, 30);
    }, [
      selectedCategory,
      performerScenes,
      studioScenes,
      tagScenes,
      generalScenes,
    ]);

    const isLoading =
      (hasPerformers && performerResult.loading && !performerScenes.length) ||
      (hasStudio && studioResult.loading && !studioScenes.length) ||
      (generalResult.loading && !generalScenes.length);

    const handleCardClick = useCallback(
      (e: React.MouseEvent, targetSceneId: string) => {
        if (onSceneClicked) {
          e.preventDefault();
          onSceneClicked(targetSceneId);
        } else {
          history.push(`/scenes/${targetSceneId}`);
        }
      },
      [onSceneClicked, history]
    );

    return (
      <div id="scene-recommendations-panel">
        <div className="scene-rec-header">
          <div className="scene-rec-categories">
            <button
              type="button"
              className={`rec-category-pill ${
                selectedCategory === "all" ? "active" : ""
              }`}
              onClick={() => setSelectedCategory("all")}
            >
              <FormattedMessage
                id="recommended_all"
                defaultMessage="全部"
              />
            </button>
            {hasPerformers && (
              <button
                type="button"
                className={`rec-category-pill ${
                  selectedCategory === "performer" ? "active" : ""
                }`}
                onClick={() => setSelectedCategory("performer")}
              >
                <FormattedMessage
                  id="recommended_same_performer"
                  defaultMessage="同演员"
                />
                {performerScenes.length > 0 && (
                  <span className="pill-count">
                    {performerScenes.length}
                  </span>
                )}
              </button>
            )}
            {hasStudio && (
              <button
                type="button"
                className={`rec-category-pill ${
                  selectedCategory === "studio" ? "active" : ""
                }`}
                onClick={() => setSelectedCategory("studio")}
              >
                <FormattedMessage
                  id="recommended_same_studio"
                  defaultMessage="同工作室"
                />
                {studioScenes.length > 0 && (
                  <span className="pill-count">{studioScenes.length}</span>
                )}
              </button>
            )}
            {hasTags && (
              <button
                type="button"
                className={`rec-category-pill ${
                  selectedCategory === "tag" ? "active" : ""
                }`}
                onClick={() => setSelectedCategory("tag")}
              >
                <FormattedMessage
                  id="recommended_same_tag"
                  defaultMessage="同标签"
                />
                {tagScenes.length > 0 && (
                  <span className="pill-count">{tagScenes.length}</span>
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            className="scene-rec-refresh-btn"
            onClick={handleRefresh}
            title={intl.formatMessage({
              id: "shuffle_batch",
              defaultMessage: "换一批",
            })}
          >
            <Icon
              icon={faSyncAlt}
              className={isRefreshing ? "fa-spin" : ""}
            />
            <span className="refresh-text">
              <FormattedMessage id="shuffle_batch" defaultMessage="换一批" />
            </span>
          </button>
        </div>

        <div className="scene-rec-list">
          {isLoading && displayedItems.length === 0 ? (
            <div className="scene-rec-loading">
              <LoadingIndicator />
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="scene-rec-empty">
              <FormattedMessage
                id="no_recommended_scenes"
                defaultMessage="暂无推荐视频"
              />
            </div>
          ) : (
            displayedItems.map((item) => (
              <SceneRecommendationCard
                key={item.scene.id}
                item={item}
                onClick={handleCardClick}
              />
            ))
          )}
        </div>
      </div>
    );
  });

export default SceneRecommendationsPanel;
