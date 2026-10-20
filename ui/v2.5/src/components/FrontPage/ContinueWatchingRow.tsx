import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useHistory } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { SceneQueue } from "src/models/sceneQueue";
import { ListFilterModel } from "src/models/list-filter/filter";
import { useConfigurationContext } from "src/hooks/Config";
import { objectTitle } from "src/core/files";
import {
  getMainVideoFile,
  formatVideoDuration,
} from "src/utils/resolution";
import TextUtils from "src/utils/text";
import { RecommendationRow } from "./RecommendationRow";
import { Icon } from "../Shared/Icon";
import {
  faChevronLeft,
  faChevronRight,
  faFilm,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import { PatchComponent } from "src/patch";
import { useUserActivity } from "src/utils/userActivity";

export const ContinueWatchingRow: React.FC = PatchComponent(
  "ContinueWatchingRow",
  () => {
    const intl = useIntl();
    const history = useHistory();
    const { configuration } = useConfigurationContext();
    const railRef = useRef<HTMLDivElement>(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const { activities, refetch: refetchActivity } = useUserActivity();

    // Extract scene IDs that THIS user has watched or has progress on
    const watchedIds = useMemo(() => {
      const entries = Object.entries(activities)
        .filter(
          ([_, act]) =>
            (act.resume_time ?? 0) >= 2 || (act.play_count ?? 0) > 0
        )
        .sort(
          (a, b) =>
            (b[1].last_played_at || 0) - (a[1].last_played_at || 0)
        )
        .map(([id]) => parseInt(id, 10))
        .filter((id) => !isNaN(id) && id > 0);
      return entries.slice(0, 20);
    }, [activities]);

    const { data, loading, refetch } = GQL.useFindScenesQuery({
      fetchPolicy: "network-only",
      skip: watchedIds.length === 0,
      variables: {
        filter: {
          page: 1,
          per_page: 20,
        },
        scene_ids: watchedIds.length > 0 ? watchedIds : undefined,
      },
    });

    // Refetch when tab becomes focused or when user activity syncs from server
    useEffect(() => {
      const handleFocus = () => {
        refetchActivity();
        if (watchedIds.length > 0) {
          refetch().catch(() => {});
        }
      };
      const handleUpdate = () => {
        if (watchedIds.length > 0) {
          refetch().catch(() => {});
        }
      };
      window.addEventListener("focus", handleFocus);
      window.addEventListener("stash:user_activity_updated", handleUpdate);
      return () => {
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("stash:user_activity_updated", handleUpdate);
      };
    }, [watchedIds, refetch, refetchActivity]);

    const scenes = useMemo(() => {
      if (watchedIds.length === 0) return [];
      const foundScenes = data?.findScenes.scenes ?? [];
      const map = new Map<string, (typeof foundScenes)[number]>();
      for (const s of foundScenes) {
        map.set(String(s.id), s);
      }

      const list: typeof foundScenes = [];
      for (const id of watchedIds) {
        const s = map.get(String(id));
        if (s) {
          const userResume = activities[String(s.id)]?.resume_time ?? 0;
          list.push({
            ...s,
            resume_time: userResume,
          });
        }
      }
      return list.slice(0, 10);
    }, [watchedIds, data?.findScenes.scenes, activities]);


    // Build playback queue so clicking a card allows smooth cycling in the player
    const sceneQueue = useMemo(() => {
      const ids = scenes.map((s) => s.id);
      return ids.length > 0 ? SceneQueue.fromSceneIDList(ids) : undefined;
    }, [scenes]);

    // Construct "View All" filter URL: all watch records sorted by last_played_at DESC
    const allHistoryUrl = useMemo(() => {
      const f = new ListFilterModel(GQL.FilterMode.Scenes, configuration);
      f.sortBy = "last_played_at";
      f.sortDirection = GQL.SortDirectionEnum.Desc;
      const playCountCrit = f.makeCriterion("play_count") as any;
      playCountCrit.modifier = GQL.CriterionModifier.GreaterThan;
      playCountCrit.value = 0;
      f.criteria = [playCountCrit];
      return `/scenes?${f.makeQueryParameters()}`;
    }, [configuration]);

    // Update scroll buttons visibility
    const updateScrollState = useCallback(() => {
      const el = railRef.current;
      if (!el) return;
      const hasOverflow = el.scrollWidth > el.clientWidth + 4;
      setCanScrollLeft(el.scrollLeft > 8);
      setCanScrollRight(
        hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 8
      );
    }, []);

    useEffect(() => {
      updateScrollState();
      window.addEventListener("resize", updateScrollState);
      return () => window.removeEventListener("resize", updateScrollState);
    }, [updateScrollState, scenes]);

    const handleScrollBy = (offset: number) => {
      railRef.current?.scrollBy({ left: offset, behavior: "smooth" });
    };

    const handleWheel = (e: React.WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && railRef.current) {
        railRef.current.scrollLeft += e.deltaY;
      }
    };

    // If loading or no watch records exist, do not render
    if ((loading && !data) || scenes.length === 0) {
      return null;
    }

    const headerNode = (
      <FormattedMessage
        id="continue_watching"
        defaultMessage="继续观看"
      />
    );

    const linkNode = (
      <Link to={allHistoryUrl}>
        <FormattedMessage id="view_all" defaultMessage="查看全部" />
      </Link>
    );

    return (
      <RecommendationRow
        className="continue-watching-row"
        header={headerNode}
        link={linkNode}
      >
        <div className="continue-watching-container">
          {canScrollLeft && (
            <button
              type="button"
              className="continue-watching-nav-btn prev"
              onClick={() => handleScrollBy(-520)}
              aria-label="Previous"
            >
              <Icon icon={faChevronLeft} />
            </button>
          )}

          <div
            ref={railRef}
            className="continue-watching-rail"
            onScroll={updateScrollState}
            onWheel={handleWheel}
          >
            {scenes.map((scene, index) => {
              const file = getMainVideoFile(scene.files);
              const duration = file?.duration ?? 0;
              const resumeTime = scene.resume_time ?? 0;
              const hasResume =
                resumeTime > 0 && duration > 0 && duration > resumeTime;
              const progressPercent = hasResume
                ? Math.min(100, Math.max(0, (resumeTime / duration) * 100))
                : 100;

              const title = objectTitle(scene);
              const performers = scene.performers.map((p) => p.name).join(", ");
              const timeDisplay = hasResume
                ? `${TextUtils.secondsToTimestamp(resumeTime)} / ${TextUtils.secondsToTimestamp(duration)}`
                : formatVideoDuration(duration);

              const cont =
                configuration?.interface.continuePlaylistDefault ?? true;
              const link = sceneQueue
                ? sceneQueue.makeLink(scene.id, {
                    sceneIndex: index,
                    continue: cont,
                  })
                : `/scenes/${scene.id}`;

              return (
                <div
                  key={scene.id}
                  className="continue-watching-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => history.push(link)}
                >
                  <div className="continue-watching-media">
                    {scene.paths.screenshot ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={scene.paths.screenshot}
                        alt={title}
                        className="continue-watching-thumb"
                      />
                    ) : (
                      <div className="continue-watching-placeholder">
                        <Icon icon={faFilm} />
                      </div>
                    )}

                    <div className="continue-watching-play-btn">
                      <Icon icon={faPlay} />
                    </div>

                    {scene.studio?.name && (
                      <span
                        className="continue-watching-studio"
                        title={scene.studio.name}
                      >
                        {scene.studio.name}
                      </span>
                    )}

                    {timeDisplay && (
                      <span className="continue-watching-duration">
                        {timeDisplay}
                      </span>
                    )}

                    <div className="continue-watching-progress-bar">
                      <div
                        className="continue-watching-progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="continue-watching-info">
                    <div className="continue-watching-title" title={title}>
                      {title}
                    </div>
                    <div className="continue-watching-meta">
                      <span
                        className="continue-watching-performers"
                        title={performers}
                      >
                        {performers || scene.studio?.name || ""}
                      </span>
                      <span className="continue-watching-status">
                        {hasResume ? (
                          <FormattedMessage
                            id="watched_progress"
                            defaultMessage="已看 {percent}%"
                            values={{ percent: Math.round(progressPercent) }}
                          />
                        ) : (
                          <FormattedMessage
                            id="watched_completed"
                            defaultMessage="已看完"
                          />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canScrollRight && (
            <button
              type="button"
              className="continue-watching-nav-btn next"
              onClick={() => handleScrollBy(520)}
              aria-label="Next"
            >
              <Icon icon={faChevronRight} />
            </button>
          )}
        </div>
      </RecommendationRow>
    );
  }
);

export default ContinueWatchingRow;
