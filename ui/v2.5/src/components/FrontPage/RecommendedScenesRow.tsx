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
import { useUserActivity } from "src/utils/userActivity";

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

const STORAGE_KEY_DAILY_REC_SALT = "stash_daily_rec_salt_state";

function getStoredDailySalt(curDate: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DAILY_REC_SALT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.date === curDate &&
        typeof parsed.salt === "number" &&
        Number.isFinite(parsed.salt)
      ) {
        return parsed.salt;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return 0;
}

function saveStoredDailySalt(curDate: string, salt: number): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_DAILY_REC_SALT,
      JSON.stringify({ date: curDate, salt })
    );
  } catch {
    // Ignore storage quota or security errors
  }
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

    // 1. Daily tracking & refresh state with localStorage persistence
    const [todayStr, setTodayStr] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    });
    const [salt, setSalt] = useState(() => {
      const d = new Date();
      const cur = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      return getStoredDailySalt(cur);
    });
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Watch date change (e.g. past midnight or tab focus on next day)
    useEffect(() => {
      const checkDate = () => {
        const d = new Date();
        const cur = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        if (cur !== todayStr) {
          setTodayStr(cur);
          const newSalt = getStoredDailySalt(cur);
          setSalt(newSalt);
          saveStoredDailySalt(cur, newSalt);
        }
      };

      const timer = setInterval(checkDate, 60000);
      window.addEventListener("focus", checkDate);
      return () => {
        clearInterval(timer);
        window.removeEventListener("focus", checkDate);
      };
    }, [todayStr]);

    // Sync salt if updated in another tab
    useEffect(() => {
      const handleStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY_DAILY_REC_SALT && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            const d = new Date();
            const cur = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            if (
              parsed &&
              parsed.date === cur &&
              typeof parsed.salt === "number"
            ) {
              setSalt(parsed.salt);
            }
          } catch {}
        }
      };

      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener("storage", handleStorage);
      };
    }, []);

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      const d = new Date();
      const cur = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      setSalt((s) => {
        const nextSalt = s + 1;
        saveStoredDailySalt(cur, nextSalt);
        return nextSalt;
      });
      setTimeout(() => setIsRefreshing(false), 600);
    }, []);

    // 2. Generate daily deterministic seed
    const dailySeed = useMemo(() => {
      const d = new Date();
      return getDailySeed(d, salt);
    }, [todayStr, salt]);

    const { activities } = useUserActivity();
    const userWatchedIds = useMemo(() => {
      return Object.entries(activities)
        .filter(
          ([_, act]) =>
            (act.resume_time ?? 0) > 0 || (act.play_count ?? 0) > 0
        )
        .sort(
          (a, b) =>
            (b[1].last_played_at || 0) - (a[1].last_played_at || 0)
        )
        .map(([id]) => parseInt(id, 10))
        .filter((id) => !isNaN(id) && id > 0)
        .slice(0, 40);
    }, [activities]);

    // 3. Query recently/frequently played scenes based on user's server watch history
    const playedResult = GQL.useFindScenesQuery({
      skip: userWatchedIds.length === 0,
      variables: {
        filter: {
          page: 1,
          per_page: 40,
        },
        scene_ids: userWatchedIds.length > 0 ? userWatchedIds : undefined,
      },
    });

    const playedScenes = playedResult.data?.findScenes.scenes ?? [];

    // 4. Extract top performers, tags, and studios with recency weighting
    const { topPerformerIds, topTagIds, topStudioIds, playedSceneIds } =
      useMemo(() => {
        const performerWeights: Record<string, number> = {};
        const tagWeights: Record<string, number> = {};
        const studioWeights: Record<string, number> = {};
        const playedIds = new Set<string>();

        playedScenes.forEach((scene, index) => {
          playedIds.add(scene.id);
          // Recency multiplier: most recent views get higher weight
          const recencyMultiplier = Math.max(1, 40 - index);
          const countWeight = (scene.play_count || 1) * recencyMultiplier;

          scene.performers.forEach((p) => {
            performerWeights[p.id] = (performerWeights[p.id] || 0) + countWeight;
          });
          scene.tags.forEach((t) => {
            tagWeights[t.id] = (tagWeights[t.id] || 0) + countWeight;
          });
          if (scene.studio?.id) {
            studioWeights[scene.studio.id] =
              (studioWeights[scene.studio.id] || 0) + countWeight;
          }
        });

        const topPerformers = Object.keys(performerWeights).sort(
          (a, b) => performerWeights[b] - performerWeights[a]
        );
        const topTags = Object.keys(tagWeights).sort(
          (a, b) => tagWeights[b] - tagWeights[a]
        );
        const topStudios = Object.keys(studioWeights).sort(
          (a, b) => studioWeights[b] - studioWeights[a]
        );

        return {
          topPerformerIds: topPerformers,
          topTagIds: topTags,
          topStudioIds: topStudios,
          playedSceneIds: playedIds,
        };
      }, [playedScenes]);

    const hasHistory =
      topPerformerIds.length > 0 ||
      topTagIds.length > 0 ||
      topStudioIds.length > 0;

    // 5. Multi-dimensional queries based on user taste
    const performerRecResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: `random_${dailySeed}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          performers: {
            value: topPerformerIds.slice(0, 10),
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: topPerformerIds.length === 0,
    });

    const tagRecResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: `random_${dailySeed + 1}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          tags: {
            value: topTagIds.slice(0, 8),
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: topTagIds.length === 0,
    });

    const studioRecResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 20,
          sort: `random_${dailySeed + 2}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
        scene_filter: {
          studios: {
            value: topStudioIds.slice(0, 4),
            modifier: GQL.CriterionModifier.Includes,
          },
        },
      },
      skip: topStudioIds.length === 0,
    });

    // Discovery / Cold-start query for diversity
    const discoveryResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 30,
          sort: `random_${dailySeed + 3}`,
          direction: GQL.SortDirectionEnum.Desc,
        },
      },
    });

    // 6. Intelligent scoring, deduplication and assembly
    const recommendedScenes = useMemo(() => {
      const performerCandidates =
        performerRecResult.data?.findScenes.scenes ?? [];
      const tagCandidates = tagRecResult.data?.findScenes.scenes ?? [];
      const studioCandidates = studioRecResult.data?.findScenes.scenes ?? [];
      const discoveryCandidates = discoveryResult.data?.findScenes.scenes ?? [];

      const candidateMap = new Map<string, GQL.SlimSceneDataFragment>();
      [
        ...performerCandidates,
        ...tagCandidates,
        ...studioCandidates,
        ...discoveryCandidates,
      ].forEach((s) => {
        if (!candidateMap.has(s.id)) {
          candidateMap.set(s.id, s);
        }
      });

      if (!hasHistory) {
        return discoveryCandidates.slice(0, 24);
      }

      const performerTopSet = new Set(topPerformerIds.slice(0, 10));
      const tagTopSet = new Set(topTagIds.slice(0, 8));
      const studioTopSet = new Set(topStudioIds.slice(0, 4));

      const scored = Array.from(candidateMap.values()).map((scene) => {
        let score = 0;
        const isUnplayed = !playedSceneIds.has(scene.id);
        if (isUnplayed) {
          score += 25; // Prioritize fresh unwatched scenes
        }

        scene.performers.forEach((p) => {
          if (performerTopSet.has(p.id)) {
            score += 12;
          }
        });

        scene.tags.forEach((t) => {
          if (tagTopSet.has(t.id)) {
            score += 6;
          }
        });

        if (scene.studio?.id && studioTopSet.has(scene.studio.id)) {
          score += 5;
        }

        return { scene, score };
      });

      // Sort descending by score, tiebreak with deterministic scene id hash
      scored.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const hashA = (parseInt(a.scene.id, 10) ^ dailySeed) % 1000;
        const hashB = (parseInt(b.scene.id, 10) ^ dailySeed) % 1000;
        return hashB - hashA;
      });

      return scored.slice(0, 24).map((item) => item.scene);
    }, [
      performerRecResult.data,
      tagRecResult.data,
      studioRecResult.data,
      discoveryResult.data,
      hasHistory,
      topPerformerIds,
      topTagIds,
      topStudioIds,
      playedSceneIds,
      dailySeed,
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
      const ids = recommendedScenes.map((s) => s.id);
      return ids.length > 0
        ? SceneQueue.fromSceneIDList(ids)
        : SceneQueue.fromListFilterModel(dummyFilter);
    }, [recommendedScenes, dummyFilter]);

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
            className={isRefreshing ? "fa-spin" : ""}
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

    const isLoading =
      playedResult.loading ||
      (recommendedScenes.length === 0 &&
        (performerRecResult.loading ||
          tagRecResult.loading ||
          studioRecResult.loading ||
          discoveryResult.loading));

    if (isLoading) {
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
