import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { SceneQueue } from "src/models/sceneQueue";
import { SceneWallPanel } from "../Scenes/SceneWallPanel";
import ScreenUtils from "src/utils/screen";
import { RecommendationRow } from "./RecommendationRow";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { PatchComponent } from "src/patch";
import { ListFilterModel } from "src/models/list-filter/filter";
import { useConfigurationContext } from "src/hooks/Config";
import { Icon } from "../Shared/Icon";
import { faSyncAlt } from "@fortawesome/free-solid-svg-icons";

/**
 * Calculates a deterministic daily seed based on local date (YYYY-MM-DD).
 * Returns an 8-digit positive integer [10000000, 99999999] compatible
 * with SQLite backend's `random_<seed>` parser (< 1e8).
 */
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

interface IRecommendedScenesRowProps {
  header: string;
  isTouch?: boolean;
}

export const RecommendedScenesRow: React.FC<IRecommendedScenesRowProps> =
  PatchComponent("RecommendedScenesRow", ({ header }) => {
    const intl = useIntl();
    const { configuration } = useConfigurationContext();
    const isMobile = ScreenUtils.useMediaQuery(
      "only screen and (max-width: 768px)"
    );

    // 1. Daily tracking & refresh state
    const [todayStr, setTodayStr] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    });
    const [salt, setSalt] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Watch date change (e.g. past midnight or tab focus on next day)
    useEffect(() => {
      const checkDate = () => {
        const d = new Date();
        const cur = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        if (cur !== todayStr) {
          setTodayStr(cur);
          setSalt(0);
        }
      };

      const timer = setInterval(checkDate, 60000);
      window.addEventListener("focus", checkDate);
      return () => {
        clearInterval(timer);
        window.removeEventListener("focus", checkDate);
      };
    }, [todayStr]);

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      setSalt((s) => s + 1);
      setTimeout(() => setIsRefreshing(false), 600);
    }, []);

    // 2. Generate daily deterministic seed
    const dailySeed = useMemo(() => {
      const d = new Date();
      return getDailySeed(d, salt);
    }, [todayStr, salt]);

    // 3. Query recently/frequently played scenes to understand taste
    const playedResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: "last_played_at",
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          play_count: {
            value: 0,
            modifier: GQL.CriterionModifier.GreaterThan,
          },
        },
      },
    });

    const playedScenes = playedResult.data?.findScenes.scenes ?? [];

    // 4. Extract top performers and tags from played scenes
    const { topPerformerIds, topTagIds, playedSceneIds } = useMemo(() => {
      const performerCounts: Record<string, number> = {};
      const tagCounts: Record<string, number> = {};
      const playedIds = new Set<string>();

      playedScenes.forEach((scene) => {
        playedIds.add(scene.id);
        const weight = scene.play_count || 1;
        scene.performers.forEach((p) => {
          performerCounts[p.id] = (performerCounts[p.id] || 0) + weight;
        });
        scene.tags.forEach((t) => {
          tagCounts[t.id] = (tagCounts[t.id] || 0) + weight;
        });
      });

      const topPerformers = Object.keys(performerCounts).sort(
        (a, b) => performerCounts[b] - performerCounts[a]
      );
      const topTags = Object.keys(tagCounts).sort(
        (a, b) => tagCounts[b] - tagCounts[a]
      );

      return {
        topPerformerIds: topPerformers,
        topTagIds: topTags,
        playedSceneIds: playedIds,
      };
    }, [playedScenes]);

    const hasHistory = topPerformerIds.length > 0 || topTagIds.length > 0;

    // 5. Build recommendation query variables using daily seed
    const recommendationVariables: GQL.FindScenesQueryVariables = useMemo(() => {
      if (topPerformerIds.length > 0) {
        return {
          filter: {
            page: 1,
            per_page: 36,
            sort: `random_${dailySeed}`,
            direction: GQL.SortDirectionEnum.Desc,
          },
          scene_filter: {
            performers: {
              value: topPerformerIds.slice(0, 12),
              modifier: GQL.CriterionModifier.Includes,
            },
          },
        };
      }

      if (topTagIds.length > 0) {
        return {
          filter: {
            page: 1,
            per_page: 36,
            sort: `random_${dailySeed}`,
            direction: GQL.SortDirectionEnum.Desc,
          },
          scene_filter: {
            tags: {
              value: topTagIds.slice(0, 12),
              modifier: GQL.CriterionModifier.Includes,
            },
          },
        };
      }

      // Cold start: recommend across whole library with deterministic daily seed
      return {
        filter: {
          page: 1,
          per_page: 36,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
      };
    }, [topPerformerIds, topTagIds, dailySeed]);

    const recResult = GQL.useFindScenesQuery({
      variables: recommendationVariables,
      skip: playedResult.loading,
    });

    const primaryCandidates = recResult.data?.findScenes.scenes ?? [];
    const needsFallback =
      !recResult.loading && hasHistory && primaryCandidates.length < 16;

    // 6. Fallback query if history-based candidates are too few in the library
    const fallbackResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 24,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
      },
      skip: recResult.loading || !needsFallback,
    });

    // 7. Compose final recommendation list: unplayed first, then played, deduplicated, capped at 24
    const recommendedScenes = useMemo(() => {
      const pool = [...primaryCandidates];
      if (needsFallback && fallbackResult.data?.findScenes.scenes) {
        const existingIds = new Set(pool.map((s) => s.id));
        for (const s of fallbackResult.data.findScenes.scenes) {
          if (!existingIds.has(s.id)) {
            pool.push(s);
            existingIds.add(s.id);
          }
          if (pool.length >= 24) break;
        }
      }

      if (!hasHistory) {
        return pool.slice(0, 24);
      }

      const unplayed: GQL.SlimSceneDataFragment[] = [];
      const played: GQL.SlimSceneDataFragment[] = [];

      pool.forEach((scene) => {
        if (playedSceneIds.has(scene.id)) {
          played.push(scene);
        } else {
          unplayed.push(scene);
        }
      });

      return [...unplayed, ...played].slice(0, 24);
    }, [
      primaryCandidates,
      fallbackResult.data,
      needsFallback,
      hasHistory,
      playedSceneIds,
    ]);

    // 8. Create dummyFilter and playback queue
    const dummyFilter = useMemo(() => {
      const f = new ListFilterModel(GQL.FilterMode.Scenes, configuration);
      f.sortBy = "random";
      f.randomSeed = dailySeed;
      f.sortDirection = GQL.SortDirectionEnum.Desc;
      return f;
    }, [configuration, dailySeed]);

    const queue = useMemo(() => {
      return SceneQueue.fromListFilterModel(dummyFilter);
    }, [dummyFilter]);

    const dateFormatted = useMemo(() => {
      try {
        return intl.formatDate(new Date(), { month: "short", day: "numeric" });
      } catch {
        const d = new Date();
        return `${d.getMonth() + 1}月${d.getDate()}日`;
      }
    }, [intl, todayStr]);

    const titleText =
      header && header !== "推荐"
        ? header
        : intl.formatMessage({
            id: "recommendations",
            defaultMessage: "每日推荐",
          });

    const headerNode = (
      <div className="daily-recommendations-header d-inline-flex align-items-center">
        <span>{titleText}</span>
        <span
          className="daily-recommendations-badge ml-2"
          title={intl.formatMessage({
            id: "daily_updated_hint",
            defaultMessage: "每日 00:00 自动更新推荐内容",
          })}
        >
          {dateFormatted}
        </span>
      </div>
    );

    const linkNode = (
      <div className="daily-recommendations-actions d-inline-flex align-items-center">
        <button
          type="button"
          className="btn-refresh-recommendations mr-2"
          onClick={handleRefresh}
          title={intl.formatMessage({
            id: "shuffle_batch",
            defaultMessage: "换一批",
          })}
        >
          <Icon
            icon={faSyncAlt}
            className={`mr-1 ${isRefreshing ? "fa-spin" : ""}`}
          />
          <span className="btn-refresh-text">
            <FormattedMessage id="shuffle_batch" defaultMessage="换一批" />
          </span>
        </button>
        <Link to="/scenes">
          <FormattedMessage id="view_all" defaultMessage="查看全部" />
        </Link>
      </div>
    );

    if (
      playedResult.loading ||
      (recResult.loading && primaryCandidates.length === 0)
    ) {
      return (
        <RecommendationRow
          className="scene-recommendations"
          header={headerNode}
          link={linkNode}
        >
          <LoadingIndicator />
        </RecommendationRow>
      );
    }

    if (recommendedScenes.length === 0) {
      return null;
    }

    return (
      <RecommendationRow
        className="scene-recommendations"
        header={headerNode}
        link={linkNode}
      >
        <SceneWallPanel
          scenes={recommendedScenes}
          sceneQueue={queue}
          zoomIndex={isMobile ? 3 : 2}
        />
      </RecommendationRow>
    );
  });
