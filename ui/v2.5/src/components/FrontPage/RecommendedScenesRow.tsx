import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { SceneQueue } from "src/models/sceneQueue";
import { SceneWallPanel } from "../Scenes/SceneWallPanel";
import { SceneRecommendationRail } from "./SceneRecommendationRail";
import ScreenUtils from "src/utils/screen";
import { RecommendationRow } from "./RecommendationRow";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { PatchComponent } from "src/patch";
import { ListFilterModel } from "src/models/list-filter/filter";
import { useConfigurationContext } from "src/hooks/Config";

interface IRecommendedScenesRowProps {
  header: string;
  isTouch?: boolean;
}

export const RecommendedScenesRow: React.FC<IRecommendedScenesRowProps> =
  PatchComponent("RecommendedScenesRow", ({ header }) => {
    const intl = useIntl();
    const { configuration } = useConfigurationContext();
    const isMobile = ScreenUtils.useMediaQuery("only screen and (max-width: 768px)");

    // 1. Query recently/frequently played scenes
    const playedResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 25,
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

    // 2. Extract top performers and tags from played scenes
    const { topPerformerIds, topTagIds, playedSceneIds } = useMemo(() => {
      const performerCounts: Record<string, number> = {};
      const tagCounts: Record<string, number> = {};
      const playedIds = new Set<string>();

      playedScenes.forEach((scene) => {
        playedIds.add(scene.id);
        const weight = (scene.play_count || 1);
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

    // 3. Build recommendation query variables
    const hasHistory = topPerformerIds.length > 0 || topTagIds.length > 0;

    const recommendationVariables: GQL.FindScenesQueryVariables = useMemo(() => {
      if (topPerformerIds.length > 0 && topTagIds.length > 0) {
        return {
          filter: {
            page: 1,
            per_page: 24,
            sort: "rating",
            direction: GQL.SortDirectionEnum.Desc,
          },
          scene_filter: {
            performers: {
              value: topPerformerIds.slice(0, 4),
              modifier: GQL.CriterionModifier.Includes,
            },
          },
        };
      }

      if (topPerformerIds.length > 0) {
        return {
          filter: {
            page: 1,
            per_page: 24,
            sort: "date",
            direction: GQL.SortDirectionEnum.Desc,
          },
          scene_filter: {
            performers: {
              value: topPerformerIds.slice(0, 5),
              modifier: GQL.CriterionModifier.Includes,
            },
          },
        };
      }

      if (topTagIds.length > 0) {
        return {
          filter: {
            page: 1,
            per_page: 24,
            sort: "date",
            direction: GQL.SortDirectionEnum.Desc,
          },
          scene_filter: {
            tags: {
              value: topTagIds.slice(0, 5),
              modifier: GQL.CriterionModifier.Includes,
            },
          },
        };
      }

      // Cold start: recommend highest rated or recently released scenes
      return {
        filter: {
          page: 1,
          per_page: 24,
          sort: "rating",
          direction: GQL.SortDirectionEnum.Desc,
        },
      };
    }, [topPerformerIds, topTagIds]);

    const recResult = GQL.useFindScenesQuery({
      variables: recommendationVariables,
      skip: playedResult.loading,
    });

    // 4. Prioritize unplayed recommended scenes first, then played ones
    const recommendedScenes = useMemo(() => {
      const candidates = recResult.data?.findScenes.scenes ?? [];
      if (!hasHistory) return candidates;

      const unplayed: GQL.SlimSceneDataFragment[] = [];
      const played: GQL.SlimSceneDataFragment[] = [];

      candidates.forEach((scene) => {
        if (playedSceneIds.has(scene.id)) {
          played.push(scene);
        } else {
          unplayed.push(scene);
        }
      });

      return [...unplayed, ...played];
    }, [recResult.data, hasHistory, playedSceneIds]);

    const dummyFilter = useMemo(() => {
      const f = new ListFilterModel(GQL.FilterMode.Scenes, configuration);
      f.sortBy = hasHistory ? "rating" : "date";
      f.sortDirection = GQL.SortDirectionEnum.Desc;
      return f;
    }, [configuration, hasHistory]);

    const queue = useMemo(() => {
      return SceneQueue.fromListFilterModel(dummyFilter);
    }, [dummyFilter]);

    if (playedResult.loading || recResult.loading) {
      return (
        <RecommendationRow
          className="scene-recommendations"
          header={header}
          link={
            <Link to="/scenes">
              <FormattedMessage id="view_all" />
            </Link>
          }
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
        header={header}
        link={
          <Link to="/scenes">
            <FormattedMessage id="view_all" />
          </Link>
        }
      >
        {isMobile ? (
          <SceneRecommendationRail
            scenes={recommendedScenes.slice(0, 16)}
            sceneQueue={queue}
          />
        ) : (
          <SceneWallPanel
            scenes={recommendedScenes}
            sceneQueue={queue}
            zoomIndex={2}
          />
        )}
      </RecommendationRow>
    );
  });
