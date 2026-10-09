import React from "react";
import { useHistory } from "react-router-dom";
import * as GQL from "src/core/generated-graphql";
import { SceneQueue } from "src/models/sceneQueue";
import { objectTitle } from "src/core/files";
import TextUtils from "src/utils/text";
import { useIntl } from "react-intl";
import {
  getMainVideoFile,
  getVideoResolutionLabel,
  formatVideoDuration,
} from "src/utils/resolution";

interface ISceneRecommendationRailProps {
  scenes: GQL.SlimSceneDataFragment[];
  sceneQueue?: SceneQueue;
}

export const SceneRecommendationRail: React.FC<ISceneRecommendationRailProps> = ({
  scenes,
  sceneQueue,
}) => {
  const history = useHistory();
  const intl = useIntl();

  if (!scenes || scenes.length === 0) {
    return null;
  }

  return (
    <div className="scene-recommendation-rail">
      {scenes.map((scene, index) => {
        const file = getMainVideoFile(scene.files);
        const title = objectTitle(scene);
        const performers = scene.performers.map((p) => p.name).join(", ");
        const duration = formatVideoDuration(file?.duration);
        const resolution = getVideoResolutionLabel(file?.width, file?.height);

        const link = sceneQueue
          ? sceneQueue.makeLink(scene.id, { sceneIndex: index })
          : `/scenes/${scene.id}`;

        return (
          <div
            key={scene.id}
            className="scene-rail-card"
            role="button"
            tabIndex={0}
            onClick={() => history.push(link)}
          >
            <div className="scene-rail-media">
              <img
                loading="lazy"
                decoding="async"
                src={scene.paths.screenshot ?? ""}
                alt={title}
                className="scene-rail-thumb"
              />
              {duration && (
                <span className="scene-rail-duration">{duration}</span>
              )}
              {resolution && (
                <span className="scene-rail-resolution">{resolution}</span>
              )}
              {scene.studio?.name && (
                <span className="scene-rail-studio" title={scene.studio.name}>
                  {scene.studio.name}
                </span>
              )}
            </div>
            <div className="scene-rail-info">
              <div className="scene-rail-title" title={title}>
                {title}
              </div>
              {performers && (
                <div className="scene-rail-performers" title={performers}>
                  {performers}
                </div>
              )}
              <div className="scene-rail-meta">
                <span className="scene-rail-date">
                  {scene.date
                    ? TextUtils.formatFuzzyDate(intl, scene.date)
                    : ""}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
