import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import { useFindScenes } from "src/core/StashService";
import { SceneQueue } from "src/models/sceneQueue";
import { ListFilterModel } from "src/models/list-filter/filter";
import { PatchComponent } from "src/patch";
import { SceneWallPanel } from "./SceneWallPanel";
import { SceneRecommendationRail } from "../FrontPage/SceneRecommendationRail";
import ScreenUtils from "src/utils/screen";
import { RecommendationRow } from "../FrontPage/RecommendationRow";
import { LoadingIndicator } from "../Shared/LoadingIndicator";

interface IProps {
  isTouch: boolean;
  filter: ListFilterModel;
  header: string;
}

export const SceneRecommendationRow: React.FC<IProps> = PatchComponent(
  "SceneRecommendationRow",
  (props) => {
    const result = useFindScenes(props.filter);
    const count = result.data?.findScenes.count ?? 0;

    const queue = useMemo(() => {
      return SceneQueue.fromListFilterModel(props.filter);
    }, [props.filter]);

    const scenes = result.data?.findScenes.scenes ?? [];

    if (!result.loading && !count) {
      return null;
    }

    const isMobile = ScreenUtils.useMediaQuery("only screen and (max-width: 768px)");

    return (
      <RecommendationRow
        className="scene-recommendations"
        header={props.header}
        link={
          <Link to={`/scenes?${props.filter.makeQueryParameters()}`}>
            <FormattedMessage id="view_all" />
          </Link>
        }
      >
        {result.loading ? (
          <LoadingIndicator />
        ) : isMobile ? (
          <SceneRecommendationRail
            scenes={scenes.slice(0, 16)}
            sceneQueue={queue}
          />
        ) : (
          <SceneWallPanel
            scenes={scenes}
            sceneQueue={queue}
            zoomIndex={2}
          />
        )}
      </RecommendationRow>
    );
  }
);
