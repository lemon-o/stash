import React, { useState } from "react";
import { Form } from "react-bootstrap";
import { useIntl } from "react-intl";
import { Link, useHistory } from "react-router-dom";
import * as GQL from "src/core/generated-graphql";
import { TruncatedText } from "src/components/Shared/TruncatedText";
import TextUtils from "src/utils/text";
import { RatingBanner } from "../Shared/RatingBanner";
import { useDragMoveSelect } from "../Shared/GridCard/dragMoveSelect";
import { Icon } from "../Shared/Icon";
import { faPlayCircle, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { PatchComponent } from "src/patch";
import ScreenUtils from "src/utils/screen";
import cx from "classnames";

const CLASSNAME = "GroupWallCard";

interface IGroupWallCardProps {
  group: GQL.ListGroupDataFragment;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean, shiftKey: boolean) => void;
  selecting?: boolean;
  zoomIndex?: number;
}

const zoomHeights: Record<number, number> = {
  0: 160,
  1: 220,
  2: 300,
  3: 420,
};

const mobileZoomHeights: Record<number, number> = {
  0: 120,
  1: 145,
  2: 175,
  3: 220,
};

export const GroupWallCard: React.FC<IGroupWallCardProps> = PatchComponent(
  "GroupWallCard",
  ({ group, selected, onSelectChange, selecting, zoomIndex = 2 }) => {
    const intl = useIntl();
    const history = useHistory();
    const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
    const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

    const { dragProps } = useDragMoveSelect({
      selecting: selecting || false,
      selected: selected || false,
      onSelectedChanged: onSelectChange
        ? (sel, shift) => onSelectChange(group.id, sel, shift)
        : undefined,
    });

    const cover = group.front_image_path || group.back_image_path;

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement, Event>) {
      const target = e.currentTarget;
      if (target.naturalWidth && target.naturalHeight) {
        const ratio = target.naturalWidth / target.naturalHeight;
        setAspectRatio(ratio);
        setOrientation(ratio > 1 ? "landscape" : "portrait");
      }
    }

    let shiftKey = false;

    function handleCardClick(e: React.MouseEvent) {
      if (selecting && onSelectChange) {
        onSelectChange(group.id, !selected, e.shiftKey);
        return;
      }
      history.push(`/groups/${group.id}`);
    }

    const isMobile = ScreenUtils.useMediaQuery("(max-width: 576px)");
    const rowHeight = isMobile
      ? (mobileZoomHeights[zoomIndex] ?? 175)
      : (zoomHeights[zoomIndex] ?? 300);
    const effectiveRatio = aspectRatio ?? (orientation === "landscape" ? 1.777 : 0.667);
    const cardWidth = Math.round(rowHeight * effectiveRatio);
    const flexGrow = Math.max(1, Math.round(effectiveRatio * 10));

    const sceneCount =
      group.scene_count !== undefined && group.scene_count !== null && group.scene_count > 0
        ? group.scene_count
        : group.scenes?.length ?? 0;

    return (
      <section
        className={cx(
          CLASSNAME,
          "wall-item",
          `${CLASSNAME}-${orientation}`,
          { "has-selection": selected }
        )}
        onClick={handleCardClick}
        onKeyPress={(e) => {
          if (e.key === "Enter") history.push(`/groups/${group.id}`);
        }}
        role="button"
        tabIndex={0}
        style={{
          height: `${rowHeight}px`,
          width: `${cardWidth}px`,
          flexGrow: flexGrow,
          flexShrink: isMobile ? 1 : 0,
          maxWidth: isMobile ? "100%" : `${Math.round(rowHeight * 2.5)}px`,
        }}
        {...dragProps}
      >
        {onSelectChange && (
          <Form.Control
            type="checkbox"
            className="wall-item-check mousetrap"
            checked={selected}
            onChange={() => onSelectChange(group.id, !selected, shiftKey)}
            onClick={(event: React.MouseEvent<HTMLInputElement, MouseEvent>) => {
              shiftKey = event.shiftKey;
              event.stopPropagation();
            }}
          />
        )}

        <RatingBanner rating={group.rating100} />

        {cover ? (
          <img
            loading="lazy"
            src={cover}
            alt={group.name}
            className={`${CLASSNAME}-img`}
            onLoad={onImageLoad}
          />
        ) : (
          <div className={`${CLASSNAME}-placeholder`}>
            <Icon icon={faFolderOpen} className={`${CLASSNAME}-placeholder-icon`} />
            <span className={`${CLASSNAME}-placeholder-title`}>{group.name}</span>
          </div>
        )}

        <div className="lineargradient">
          <footer className={`${CLASSNAME}-footer`}>
            <Link
              to={`/groups/${group.id}`}
              onClick={(e) => {
                if (selecting) {
                  e.preventDefault();
                  handleCardClick(e);
                }
                e.stopPropagation();
              }}
            >
              <TruncatedText
                text={group.name}
                lineCount={2}
                className={`${CLASSNAME}-title`}
              />
              <div className={`${CLASSNAME}-subinfo`}>
                {sceneCount > 0 && (
                  <span className="group-scene-badge">
                    <Icon icon={faPlayCircle} className="mr-1" />
                    {sceneCount}
                  </span>
                )}
                {group.date && (
                  <span className="group-date">
                    {TextUtils.formatFuzzyDate(intl, group.date)}
                  </span>
                )}
                {group.studio && (
                  <span className="group-studio">{group.studio.name}</span>
                )}
              </div>
            </Link>
          </footer>
        </div>
      </section>
    );
  }
);

export default GroupWallCard;
