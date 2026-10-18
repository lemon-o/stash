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
  getVideoResolutionLabel,
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

export const ContinueWatchingRow: React.FC = PatchComponent(
  "ContinueWatchingRow",
  () => {
    const intl = useIntl();
    const history = useHistory();
    const { configuration } = useConfigurationContext();
    const railRef = useRef<HTMLDivElement>(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Query 10 most recent watch records, sorted by last_played_at DESC
    const { data, loading } = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: 10,
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

    const scenes = useMemo(() => {
      return data?.findScenes.scenes ?? [];
    }, [data?.findScenes.scenes]);

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
    if (loading || scenes.length === 0) {
      return null;
    }

    const headerNode = (
      <div className="continue-watching-header d-inline-flex align-items-center">
        <span>
          <FormattedMessage
            id="continue_watching"
            defaultMessage="继续观看"
          />
        </span>
        <span className="continue-watching-count ml-2">
          {scenes.length >= 10 ? "最近 10 部" : `${scenes.length} 部`}
        </span>
      </div>
    );

    const linkNode = (
      <div className="continue-watching-actions d-inline-flex align-items-center">
        <Link to={allHistoryUrl} className="continue-watching-all-link">
          <FormattedMessage id="view_all" defaultMessage="查看全部" />
          <Icon icon={faChevronRight} className="ml-1" />
        </Link>
      </div>
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
              const resolution = getVideoResolutionLabel(
                file?.width,
                file?.height
              );
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

                    {resolution && (
                      <span className="continue-watching-resolution">
                        {resolution}
                      </span>
                    )}

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
