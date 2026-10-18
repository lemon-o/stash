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
import { SceneQueue } from "src/models/sceneQueue";
import {
  getMainVideoFile,
  getVideoResolutionLabel,
  formatVideoDuration,
} from "src/utils/resolution";

interface ISceneRecommendationsPanelProps {
  scene: GQL.SceneDataFragment;
  onSceneClicked?: (sceneID: string, allRecIds?: string[]) => void;
}

type FilterCategory = "all" | "group" | "performer" | "studio" | "tag";

interface IRecommendationItem {
  scene: GQL.SlimSceneDataFragment;
  reason: "group" | "performer" | "studio" | "tag" | "general";
  reasonLabel: string;
  score: number;
}

/**
 * Calculates a deterministic random seed tied to the current scene ID,
 * current local date, and salt. Returns an 8-digit positive integer
 * in [10000000, 99999999] compatible with SQLite's `random_<seed>` parser.
 */
function getSceneRecSeed(sceneId: string, salt: number = 0): number {
  let h = 0;
  for (let i = 0; i < sceneId.length; i++) {
    h = (Math.imul(31, h) + sceneId.charCodeAt(i)) | 0;
  }
  const d = new Date();
  const day = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let seed = (h ^ day ^ (salt * 100003)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  return (seed % 90000000) + 10000000;
}

const SceneRecommendationCard: React.FC<{
  item: IRecommendationItem;
  cardLink: string;
  onClick: (e: React.MouseEvent, sceneId: string) => void;
}> = React.memo(({ item, cardLink, onClick }) => {
  const { scene: s, reason, reasonLabel } = item;
  const intl = useIntl();
  const [isHovered, setIsHovered] = useState(false);

  const file = getMainVideoFile(s.files);
  const title = objectTitle(s);
  const performers = s.performers.map((p) => p.name).join(", ");
  const duration = formatVideoDuration(file?.duration);
  const resolution = getVideoResolutionLabel(file?.width, file?.height);

  const previewVideo = s.paths.preview;

  return (
    <Link
      to={cardLink}
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

    // Scene-specific seed ensures every scene has a distinct recommendation pool and random order
    const sceneSeed = useMemo(() => {
      return getSceneRecSeed(scene.id, salt);
    }, [scene.id, salt]);

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      setSalt((s) => s + 1);
      setTimeout(() => setIsRefreshing(false), 500);
    }, []);

    // 1. Group / Series matching
    const groupIds = useMemo(
      () => scene.groups?.map((g) => g.group.id) ?? [],
      [scene.groups]
    );
    const hasGroups = groupIds.length > 0;

    const groupResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 24,
          sort: `random_${sceneSeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          groups: {
            value: groupIds,
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: !hasGroups,
    });

    // 2. Performers matching
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
          sort: `random_${sceneSeed + 1}`,
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

    // 3. Studio matching
    const studioId = scene.studio?.id;
    const hasStudio = !!studioId;

    const studioResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 20,
          sort: `random_${sceneSeed + 2}`,
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

    // 4. Tags matching (top 8 tags)
    const tagIds = useMemo(
      () => scene.tags.map((t) => t.id).slice(0, 8),
      [scene.tags]
    );
    const hasTags = tagIds.length > 0;

    const tagResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 24,
          sort: `random_${sceneSeed + 3}`,
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

    // 5. Discovery / Library diversity query (seeded specifically for this scene)
    const discoveryResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: `random_${sceneSeed + 4}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
      },
    });

    // Lookup sets for computing relevance scores
    const currentGroupIds = useMemo(() => new Set(groupIds), [groupIds]);
    const currentPerformerIds = useMemo(
      () => new Set(performerIds),
      [performerIds]
    );
    const currentTagIds = useMemo(() => new Set(tagIds), [tagIds]);

    // Helper to evaluate a candidate scene's relevance score and primary reason badge
    const scoreCandidate = useCallback(
      (s: GQL.SlimSceneDataFragment): IRecommendationItem => {
        let score = 0;
        let primaryReason: "group" | "performer" | "studio" | "tag" | "general" =
          "general";
        let reasonLabel = intl.formatMessage({
          id: "recommended_for_you",
          defaultMessage: "为你推荐",
        });

        // 1. Group match (+30 pts)
        if (hasGroups) {
          const matchedGroup = s.groups?.find((g) =>
            currentGroupIds.has(g.group.id)
          );
          if (matchedGroup) {
            score += 30;
            primaryReason = "group";
            reasonLabel = intl.formatMessage(
              {
                id: "recommended_same_group_named",
                defaultMessage: "同系列: {name}",
              },
              { name: matchedGroup.group.name }
            );
          }
        }

        // 2. Performer match (+15 pts per shared performer)
        let matchedPerformersCount = 0;
        let firstMatchedPerformer: { id: string; name: string } | undefined;
        s.performers.forEach((p) => {
          if (currentPerformerIds.has(p.id)) {
            matchedPerformersCount++;
            if (!firstMatchedPerformer) firstMatchedPerformer = p;
          }
        });
        if (matchedPerformersCount > 0) {
          score += matchedPerformersCount * 15;
          if (primaryReason === "general") {
            primaryReason = "performer";
            reasonLabel = intl.formatMessage(
              {
                id: "recommended_same_performer_named",
                defaultMessage: "同演员: {name}",
              },
              { name: firstMatchedPerformer!.name }
            );
          }
        }

        // 3. Studio match (+10 pts)
        if (hasStudio && s.studio?.id === studioId) {
          score += 10;
          if (primaryReason === "general") {
            primaryReason = "studio";
            reasonLabel = scene.studio?.name
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
          }
        }

        // 4. Tag match (+5 pts per shared tag)
        let matchedTagsCount = 0;
        let firstMatchedTag: { id: string; name: string } | undefined;
        s.tags.forEach((t) => {
          if (currentTagIds.has(t.id)) {
            matchedTagsCount++;
            if (!firstMatchedTag) firstMatchedTag = t;
          }
        });
        if (matchedTagsCount > 0) {
          score += matchedTagsCount * 5;
          if (primaryReason === "general") {
            primaryReason = "tag";
            reasonLabel = intl.formatMessage(
              {
                id: "recommended_same_tag_named",
                defaultMessage: "同标签: {name}",
              },
              { name: firstMatchedTag!.name }
            );
          }
        }

        return {
          scene: s,
          reason: primaryReason,
          reasonLabel,
          score,
        };
      },
      [
        hasGroups,
        currentGroupIds,
        currentPerformerIds,
        hasStudio,
        studioId,
        scene.studio?.name,
        currentTagIds,
        intl,
      ]
    );

    // Filter category lists
    const groupScenes = useMemo(() => {
      const list = groupResult.data?.findScenes.scenes ?? [];
      return list
        .filter((s) => s.id !== scene.id)
        .map(scoreCandidate)
        .sort((a, b) => b.score - a.score);
    }, [groupResult.data, scene.id, scoreCandidate]);

    const performerScenes = useMemo(() => {
      const list = performerResult.data?.findScenes.scenes ?? [];
      return list
        .filter((s) => s.id !== scene.id)
        .map(scoreCandidate)
        .sort((a, b) => b.score - a.score);
    }, [performerResult.data, scene.id, scoreCandidate]);

    const studioScenes = useMemo(() => {
      const list = studioResult.data?.findScenes.scenes ?? [];
      return list
        .filter((s) => s.id !== scene.id)
        .map(scoreCandidate)
        .sort((a, b) => b.score - a.score);
    }, [studioResult.data, scene.id, scoreCandidate]);

    const tagScenes = useMemo(() => {
      const list = tagResult.data?.findScenes.scenes ?? [];
      return list
        .filter((s) => s.id !== scene.id)
        .map(scoreCandidate)
        .sort((a, b) => b.score - a.score);
    }, [tagResult.data, scene.id, scoreCandidate]);

    // Aggregate items based on selected category with multi-dimensional ranking
    const displayedItems = useMemo(() => {
      if (selectedCategory === "group") {
        return groupScenes;
      }
      if (selectedCategory === "performer") {
        return performerScenes;
      }
      if (selectedCategory === "studio") {
        return studioScenes;
      }
      if (selectedCategory === "tag") {
        return tagScenes;
      }

      // "all" - Merge all candidates and score by relevance to the current scene
      const candidateMap = new Map<string, GQL.SlimSceneDataFragment>();
      const addCandidates = (scenes: GQL.SlimSceneDataFragment[] | undefined) => {
        scenes?.forEach((s) => {
          if (s.id !== scene.id && !candidateMap.has(s.id)) {
            candidateMap.set(s.id, s);
          }
        });
      };

      addCandidates(groupResult.data?.findScenes.scenes);
      addCandidates(performerResult.data?.findScenes.scenes);
      addCandidates(studioResult.data?.findScenes.scenes);
      addCandidates(tagResult.data?.findScenes.scenes);
      addCandidates(discoveryResult.data?.findScenes.scenes);

      const scoredItems = Array.from(candidateMap.values()).map(scoreCandidate);

      scoredItems.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Tie-breaker based on pseudo-random hash with scene-specific seed
        const hashA = (parseInt(a.scene.id, 10) ^ sceneSeed) % 1000;
        const hashB = (parseInt(b.scene.id, 10) ^ sceneSeed) % 1000;
        return hashB - hashA;
      });

      return scoredItems.slice(0, 30);
    }, [
      selectedCategory,
      groupScenes,
      performerScenes,
      studioScenes,
      tagScenes,
      scene.id,
      groupResult.data,
      performerResult.data,
      studioResult.data,
      tagResult.data,
      discoveryResult.data,
      scoreCandidate,
      sceneSeed,
    ]);

    const isLoading =
      (hasGroups && groupResult.loading && !groupScenes.length) ||
      (hasPerformers && performerResult.loading && !performerScenes.length) ||
      (hasStudio && studioResult.loading && !studioScenes.length) ||
      (hasTags && tagResult.loading && !tagScenes.length) ||
      (discoveryResult.loading && !displayedItems.length);

    const recIds = useMemo(
      () => displayedItems.map((item) => item.scene.id),
      [displayedItems]
    );

    const recQueue = useMemo(() => {
      const allIds = Array.from(new Set([scene.id, ...recIds]));
      return SceneQueue.fromSceneIDList(allIds);
    }, [scene.id, recIds]);

    const handleCardClick = useCallback(
      (e: React.MouseEvent, targetSceneId: string) => {
        if (onSceneClicked) {
          e.preventDefault();
          onSceneClicked(targetSceneId, recIds);
        } else {
          history.push(
            recQueue.makeLink(targetSceneId, {
              autoPlay: true,
              continue: true,
            })
          );
        }
      },
      [onSceneClicked, history, recIds, recQueue]
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
            {hasGroups && groupScenes.length > 0 && (
              <button
                type="button"
                className={`rec-category-pill ${
                  selectedCategory === "group" ? "active" : ""
                }`}
                onClick={() => setSelectedCategory("group")}
              >
                <FormattedMessage
                  id="recommended_same_group"
                  defaultMessage="同系列"
                />
                <span className="pill-count">{groupScenes.length}</span>
              </button>
            )}
            {hasPerformers && performerScenes.length > 0 && (
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
                <span className="pill-count">{performerScenes.length}</span>
              </button>
            )}
            {hasStudio && studioScenes.length > 0 && (
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
                <span className="pill-count">{studioScenes.length}</span>
              </button>
            )}
            {hasTags && tagScenes.length > 0 && (
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
                <span className="pill-count">{tagScenes.length}</span>
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
                cardLink={recQueue.makeLink(item.scene.id, {
                  autoPlay: true,
                  continue: true,
                })}
                onClick={handleCardClick}
              />
            ))
          )}
        </div>
      </div>
    );
  });

export default SceneRecommendationsPanel;
